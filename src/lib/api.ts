import type {
  ControlResult,
  LoginResponse,
  StatusResponse,
  VehicleState,
} from './types'
import { DEMO_BASE, DEMO_TOKEN, mockStatus, mockVehicleState } from './mock'

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

export function normalizeBase(url: string): string {
  let u = (url || '').trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  return u.replace(/\/+$/, '')
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
  if (!base) throw new ApiError('Enter your car URL', 0)
  if (!code) throw new ApiError('Enter your access code', 0)

  // 1) Read the device ID (public endpoint) unless the user pasted a full token.
  let deviceId = ''
  if (!code.includes('-')) {
    try {
      const st = await fetch(base + '/auth/status')
      const sd = await st.json()
      deviceId = sd?.deviceId || ''
    } catch {
      throw new ApiError('Cannot reach the car. Check the URL and that the tunnel/LAN is up.', 0)
    }
    if (!deviceId || deviceId === 'unknown') {
      throw new ApiError('Could not read the device ID from the car.', 0)
    }
  }

  // 2) Combine into the full token (or use as-is if a full token was pasted).
  const fullToken = code.includes('-') ? code : `${deviceId}-${code}`

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
    throw new ApiError('Cannot reach the car. Check the URL and that the tunnel/LAN is up.', 0)
  }
  let data: LoginResponse = {}
  try { data = (await res.json()) as LoginResponse } catch { /* ignore */ }
  if (!res.ok || !data.success || !data.jwt) {
    throw new ApiError(data.error || `Login failed (${res.status})`, res.status)
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
    throw new ApiError('Network error', 0)
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
  return { success: true, message: 'Demo mode — not sent to a car' } as unknown as T
}

export const apiGet = <T>(path: string): Promise<T> => request<T>('GET', path)
export const apiPost = <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body)

// --- reads ---
export const getStatus = (): Promise<StatusResponse> => apiGet<StatusResponse>('/status')
export const getVehicleState = (): Promise<VehicleState> => apiGet<VehicleState>('/api/vehicle/state')

// --- vehicle controls ---
export const lock = (): Promise<ControlResult> => apiPost('/api/vehicle/lock')
export const unlock = (): Promise<ControlResult> => apiPost('/api/vehicle/unlock')
export const flash = (): Promise<ControlResult> => apiPost('/api/vehicle/flash')
export const findCar = (): Promise<ControlResult> => apiPost('/api/vehicle/find-car')
export const setTrunk = (action: 'open' | 'close'): Promise<ControlResult> =>
  apiPost('/api/vehicle/trunk', { action })

// windows: area 0 with command 1 (open) / 2 (close), or action:"vent"
export const openAllWindows = (): Promise<ControlResult> => apiPost('/api/vehicle/window', { area: 0, command: 1 })
export const closeAllWindows = (): Promise<ControlResult> => apiPost('/api/vehicle/window', { area: 0, command: 2 })
export const ventWindows = (): Promise<ControlResult> => apiPost('/api/vehicle/window', { action: 'vent' })

export const climateOn = (temp: number, remoteDurationMinutes = 15): Promise<ControlResult> =>
  apiPost('/api/vehicle/climate', { action: 'power_on', temp, remoteDurationMinutes })
export const climateOff = (): Promise<ControlResult> => apiPost('/api/vehicle/climate', { action: 'power_off' })

export const setChargeCap = (percent: number, enabled = true): Promise<ControlResult> =>
  apiPost('/api/vehicle/charge-cap', { percent, enabled })
export const startCharging = (): Promise<ControlResult> => apiPost('/api/vehicle/start-charging')

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
