import type {
  CloudStatus,
  ControlResult,
  LauncherSummary,
  LoginResponse,
  StatusResponse,
  VehicleState,
} from './types'
import { DEMO_BASE, DEMO_TOKEN, mockStatus, mockVehicleState } from './mock'
import { t } from './i18n'

// --- persisted config (entered once on the setup screen) ---
const K_BASE = 'odpwa.baseUrl'
const K_JWT = 'odpwa.jwt'
const K_DEVICE = 'odpwa.deviceId'

export function getBaseUrl(): string { return localStorage.getItem(K_BASE) || '' }
export function getJwt(): string { return localStorage.getItem(K_JWT) || '' }
export function getDeviceId(): string { return localStorage.getItem(K_DEVICE) || '' }
export function isConfigured(): boolean { return !!getBaseUrl() && !!getJwt() }

/** Drop the session token but keep the URL, so re-login only needs the token. */
export function clearAuth(): void { localStorage.removeItem(K_JWT) }
/** Full reset (sign out). */
export function clearAll(): void {
  localStorage.removeItem(K_JWT)
  localStorage.removeItem(K_BASE)
  localStorage.removeItem(K_DEVICE)
}

/** Reduce a pasted URL to just its origin (scheme://host[:port]) — drops any path/query. */
export function normalizeBase(url: string): string {
  let u = (url || '').trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  try {
    return new URL(u).origin
  } catch {
    return u.replace(/\/+$/, '')
  }
}

/** demo, or an 8-char access code. */
export function isValidAccessCode(code: string): boolean {
  const c = (code || '').trim()
  return c.toLowerCase() === 'demo' || c.length === 8
}

export class AuthError extends Error {}
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Exchange a device token for a session JWT and persist base URL + JWT. */
/**
 * Pair with a car. `accessCode` is the 8-char code shown in the OverDrive app
 * (Dashboard → Access Code) / web login page. Mirrors OD's own login page: the
 * real token sent to /auth/token is `<deviceId>-<accessCode>`, where deviceId
 * comes from the public /auth/status endpoint.
 */
export async function login(baseUrlRaw: string, accessCode: string): Promise<LoginResponse> {
  const code = (accessCode || '').trim().toLowerCase()

  // Demo mode: code `demo` unlocks the UI with mock data, no car required.
  if (code === DEMO_TOKEN) {
    localStorage.setItem(K_BASE, DEMO_BASE)
    localStorage.setItem(K_JWT, DEMO_TOKEN)
    localStorage.setItem(K_DEVICE, 'DEMO-SEAL-01')
    return { success: true, jwt: DEMO_TOKEN, deviceId: 'DEMO-SEAL-01' }
  }

  const base = normalizeBase(baseUrlRaw)
  if (!base) throw new ApiError(t('err.enter_url'), 0)
  if (!code) throw new ApiError(t('err.enter_code'), 0)

  // 1) Read the device ID (public endpoint) to build the full token.
  let deviceId = ''
  try {
    const st = await fetch(base + '/auth/status')
    const sd = await st.json()
    deviceId = sd?.deviceId || ''
  } catch {
    throw new ApiError(t('err.cannot_reach'), 0)
  }
  if (!deviceId || deviceId === 'unknown') {
    throw new ApiError(t('err.no_device'), 0)
  }

  // 2) The real token is `<deviceId>-<accessCode>`, mirroring OD's login page.
  const fullToken = `${deviceId}-${code}`

  let res: Response
  try {
    res = await fetch(base + '/auth/token', {
      method: 'POST',
      // text/plain is a CORS "simple" content type, so the browser sends NO
      // preflight. zrok returns 502 on `OPTIONS /auth/token` specifically, and
      // the backend parses the JSON body regardless of content-type — so this
      // sidesteps the broken preflight. (Authenticated /api/* paths preflight
      // fine, so they keep the Authorization header.)
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ token: fullToken }),
    })
  } catch {
    throw new ApiError(t('err.cannot_reach'), 0)
  }
  let data: LoginResponse = {}
  try { data = (await res.json()) as LoginResponse } catch { /* ignore */ }
  if (!res.ok || !data.success || !data.jwt) {
    throw new ApiError(data.error || t('err.login_failed_n', { status: res.status }), res.status)
  }
  localStorage.setItem(K_BASE, base)
  localStorage.setItem(K_JWT, data.jwt)
  localStorage.setItem(K_DEVICE, data.deviceId || deviceId)
  return data
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = getBaseUrl()
  const jwt = getJwt()
  if (!base || !jwt) throw new AuthError('Not configured')

  if (base === DEMO_BASE) return demoResponse<T>(path)

  const headers: Record<string, string> = { Authorization: 'Bearer ' + jwt }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(t('err.network'), 0)
  }

  if (res.status === 401) {
    clearAuth()
    throw new AuthError('Unauthorized')
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      msg = j.error || j.message || msg
    } catch { /* ignore */ }
    throw new ApiError(msg, res.status)
  }

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await res.json()) as T
  return undefined as unknown as T
}

async function demoResponse<T>(path: string): Promise<T> {
  await new Promise((r) => setTimeout(r, 180))
  if (path === '/status') return mockStatus() as unknown as T
  if (path === '/api/vehicle/state') return mockVehicleState() as unknown as T
  if (path === '/api/launcher/v1/summary')
    return { charging: { active: true, kw: 7.2, etaMin: 135, targetPct: 80 } } as unknown as T
  if (path === '/api/trips/config') {
    return { success: true, config: { enabled: true } } as unknown as T
  }
  if (path.startsWith('/api/trips')) {
    return { success: true, trips: [{ odometerEndKm: 24680.4 }] } as unknown as T
  }
  if (path === '/api/vehicle/cloud-status') {
    // demo aid: set localStorage odpwa.demoNoCloud=1 to preview the no-cloud UI
    const cfg = localStorage.getItem('odpwa.demoNoCloud') !== '1'
    return { success: true, configured: cfg, verified: cfg, enabled: cfg } as unknown as T
  }
  return { success: true, message: 'Demo mode — not sent to a car' } as unknown as T
}

export const apiGet = <T>(path: string): Promise<T> => request<T>('GET', path)
export const apiPost = <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body)

// --- reads ---
export const getStatus = (): Promise<StatusResponse> => apiGet<StatusResponse>('/status')
export const getVehicleState = (): Promise<VehicleState> => apiGet<VehicleState>('/api/vehicle/state')
export const getCloudStatus = (): Promise<CloudStatus> => apiGet<CloudStatus>('/api/vehicle/cloud-status')
// Launcher summary — used for the charging time-to-full estimate (charging.etaMin).
export const getSummary = (): Promise<LauncherSummary> => apiGet<LauncherSummary>('/api/launcher/v1/summary')

// --- vehicle controls ---
export const lock = (): Promise<ControlResult> => apiPost('/api/vehicle/lock')
export const unlock = (): Promise<ControlResult> => apiPost('/api/vehicle/unlock')
export const flash = (): Promise<ControlResult> => apiPost('/api/vehicle/flash')
export const findCar = (): Promise<ControlResult> => apiPost('/api/vehicle/find-car')
export const setTrunk = (action: 'open' | 'close'): Promise<ControlResult> =>
  apiPost('/api/vehicle/trunk', { action })

/*
 * Windows. Routing differs per command on the head unit, which decides whether
 * BYD Cloud is needed at all:
 *   area 0 + command 1 (open all)   → SDK_ONLY   — local, no cloud
 *   area 0 + command 2 (close all)  → SDK_FIRST  — local, cloud only as fallback
 *   area 1-6 + targetPercent        → SDK_ONLY   — local, no cloud
 *   action "vent"                   → CLOUD_ONLY — BYD's OPENWINDOW crack; needs cloud
 * So only vent is gated on cloud; everything else works on a car with no BYD
 * Cloud account at all.
 */
export const openAllWindows = (): Promise<ControlResult> => apiPost('/api/vehicle/window', { area: 0, command: 1 })
export const closeAllWindows = (): Promise<ControlResult> => apiPost('/api/vehicle/window', { area: 0, command: 2 })

/*
 * Odometer.
 *
 * Read from the TRIP LOG, which is the only HTTP surface that carries it.
 * Everything else was tried against the car and does not work:
 *
 *   - /status, /api/vehicle/state, launcher summary: no mileage at all.
 *   - AutoService bridge (get-int on 4096/4103/4104): returns INVALID_VALUE on
 *     this trim. The collector never used that transport for mileage.
 *   - sdk-getter, which WOULD reach the BYD SDK device the collector uses:
 *     resolves the device by reflecting on a BydDataCollector field by name,
 *     and release builds run R8 with no keep rule for that class, so the field
 *     is renamed. Broken on every release build, not just this one.
 *
 * TripDatabase records the odometer at each trip boundary and serves it, so
 * the newest trip's end reading is the current odometer. It therefore updates
 * when a trip CLOSES, not continuously — it can lag by one drive.
 *
 * The EV / HEV split has no HTTP surface at all: trips record energy consumed,
 * not distance per drivetrain, so those stay null until OverDrive exposes the
 * `mileage` block that BydVehicleData.toJson() already builds.
 */
interface TripRow { odometerEndKm?: number }
interface TripConfig { config?: { enabled?: boolean } }

export interface Odometer { totalKm: number | null; evKm: number | null; hevKm: number | null }

const NO_ODO: Odometer = { totalKm: null, evKm: null, hevKm: null }

export async function getOdometer(): Promise<Odometer> {
  try {
    // Both in one round trip; either failing alone must not lose the other.
    const [cfg, log] = await Promise.all([
      apiGet<TripConfig>('/api/trips/config').catch(() => null),
      apiGet<{ trips?: TripRow[] }>('/api/trips?limit=1').catch(() => null),
    ])

    // With trip recording OFF the newest row can be arbitrarily old, so its end
    // reading is NOT the current odometer — it is whatever it was when logging
    // stopped. Showing that as "odometer" would be quietly wrong in a way the
    // user cannot see, so drop it and let the hero fall back to range.
    // Only an explicit false suppresses it: an unreachable or older build that
    // omits the flag should keep working.
    if (cfg?.config?.enabled === false) return NO_ODO

    const km = log?.trips?.[0]?.odometerEndKm
    // Cars that do not report the odometer leave this at 0 rather than absent.
    const totalKm = typeof km === 'number' && km > 0 ? Math.round(km) : null
    return { totalKm, evKm: null, hevKm: null }
  } catch {
    return NO_ODO // never break the poll
  }
}

/** Window areas: 1=LF 2=RF 3=LR 4=RR 5=sunroof 6=sunshade. */
export const setWindowPercent = (area: number, targetPercent: number): Promise<ControlResult> =>
  apiPost('/api/vehicle/window', { area, targetPercent })

/** How far open a "vent" crack is, in percent — roughly BYD's own crack. */
const VENT_PERCENT = 15
const SIDE_WINDOWS = [1, 2, 3, 4]

/**
 * Vent = crack all four side windows.
 *
 * BYD's own OPENWINDOW command is CLOUD_ONLY, so the obvious `{action:"vent"}`
 * call fails outright on a car with no BYD Cloud account. Positioning each
 * window instead (`area` + `targetPercent`) routes SDK_ONLY on the head unit,
 * which needs no cloud at all — and since OverDrive runs ON the head unit, if
 * we can reach the API the local path is available by definition.
 *
 * Cloud vent stays as the fallback for a car whose SDK rejects positioning.
 */
export async function ventWindows(): Promise<ControlResult> {
  const results = await Promise.all(
    SIDE_WINDOWS.map((area) =>
      setWindowPercent(area, VENT_PERCENT).catch((e: unknown): ControlResult => ({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      })),
    ),
  )
  const ok = results.filter((r) => r.success !== false && !r.error)
  if (ok.length === SIDE_WINDOWS.length) return { success: true }
  // Partial success is still a real vent — report it rather than failing over
  // and driving the windows twice.
  if (ok.length > 0) return { success: true, message: `${ok.length}/${SIDE_WINDOWS.length}` }
  return apiPost('/api/vehicle/window', { action: 'vent' })
}

export const climateOn = (temp: number, remoteDurationMinutes = 15): Promise<ControlResult> =>
  apiPost('/api/vehicle/climate', { action: 'power_on', temp, remoteDurationMinutes })
export const climateOff = (): Promise<ControlResult> => apiPost('/api/vehicle/climate', { action: 'power_off' })
export const setClimateTemp = (temp: number, zone = 0): Promise<ControlResult> =>
  apiPost('/api/vehicle/climate', { action: 'set_temp', zone, temp })
export const setFan = (fan: number): Promise<ControlResult> =>
  apiPost('/api/vehicle/climate', { action: 'set_fan', fan })
export const setClimateAuto = (on: boolean): Promise<ControlResult> =>
  apiPost('/api/vehicle/climate', { action: on ? 'auto_on' : 'auto_off' })


// Seat climate: position 1 = driver, 2 = passenger; level 0-2 (off/low/high).
export const setSeatVent = (position: 1 | 2, level: number): Promise<ControlResult> =>
  apiPost('/api/vehicle/seat', { action: 'ventilation', position, level })
export const setSeatHeat = (position: 1 | 2, level: number): Promise<ControlResult> =>
  apiPost('/api/vehicle/seat', { action: 'heating', position, level })

// --- WiCarlink / 51DK: run actions on the head unit via the keymap daemon ---
// Launch an installed app (no special permission needed).
export const openApp = (pkg: string, label?: string): Promise<ControlResult> =>
  apiPost('/api/keymap/fire', { kind: 'openApp', package: pkg, label: label || pkg })
// Run a shell/adb command on the head unit. Requires OD "Advanced actions"
// (Key Mapping → allowAdvanced); otherwise the backend replies 403.
export const fireShell = (cmd: string): Promise<ControlResult> =>
  apiPost('/api/keymap/fire', { kind: 'shell', cmd })

interface KeymapConfig { enabled?: boolean; allowAdvanced?: boolean; bindings?: unknown[] }
export const getKeymapConfig = (): Promise<KeymapConfig> => apiGet<KeymapConfig>('/api/keymap/config')

/** Turn on OD's advanced-actions gate, preserving existing enabled + bindings. */
export async function enableAdvancedActions(): Promise<ControlResult> {
  const cfg = await getKeymapConfig()
  return apiPost<ControlResult>('/api/keymap/config', {
    enabled: cfg.enabled ?? true,
    allowAdvanced: true,
    bindings: cfg.bindings ?? [],
  })
}
