import { batch, effect, signal } from '@preact/signals'
import {
  AuthError, cloudLiveRejected, cloudLiveUrl, cloudOnly, cloudRouted, cloudState, cloudUsable, dataSource, getCloudStatus, getOdometer,
  getStatus, getSummary, getTunnelStatus, getVehicleState, maybeRefreshCloud, migrateCarSetup, resetBreaker, syncCloudState,
} from './api'
import type { Odometer } from './api'
import { t } from './i18n'
import { LiveLink } from './live'
import type { LiveMessage } from './live'
import type { CloudStatus, DeviceOdometer, LauncherSummary, StatusResponse, VehicleState } from './types'

export const status = signal<StatusResponse | null>(null)
export const vehicleState = signal<VehicleState | null>(null)
export const connected = signal(false)
// Which path is answering — 'cloud' means SL6VN Cloud is standing in for the tunnel.
export { dataSource }
/*
 * Odometer. Read on a slower cadence than telemetry (60s vs 5s): it comes from
 * the trip log, which only advances when a trip closes, so asking on every
 * 5s poll would be pure waste.
 */
/*
 * The odometer is remembered across launches.
 *
 * It arrives a beat after /status — long enough that the hero used to show a
 * "--" on every cold start. An odometer only ever grows, and only while the car
 * is being driven, so yesterday's reading is a far better first paint than no
 * reading at all; the live value replaces it as soon as the car answers.
 *
 * Written to only when the car actually reports something (see getOdometer's
 * null vs NO_ODO contract), so a tunnel blip cannot erase it. It is car-linked
 * data, so it lives under odpwa.* and sign-out clears it with everything else.
 */
const K_ODO = 'odpwa.odo'
function readCachedOdo(): Odometer | null {
  try {
    const raw = localStorage.getItem(K_ODO)
    if (!raw) return null
    const o: unknown = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null)
    const c = o as Record<string, unknown>
    const totalKm = num(c.totalKm)
    // A cached "no odometer" is worth nothing on first paint — it would just
    // render the range, which is what happens anyway once the car answers.
    if (totalKm == null) return null
    return { totalKm, evKm: num(c.evKm), hevKm: num(c.hevKm), fuelLPer100: num(c.fuelLPer100) }
  } catch {
    return null
  }
}

export const odometer = signal<Odometer | null>(readCachedOdo())

/*
 * Two sources feed the odometer, and the live one wins.
 *
 *   - The DEVICE STATE reports the odometer directly in /api/vehicle/state
 *     (`odometer`: total, plus the EV/HEV split on a PHEV) — authoritative and
 *     updated every poll.
 *   - The TRIP LOG derives it from the newest trip's end reading. It only moves
 *     when a trip closes, and carries no EV/HEV split, but it also computes the
 *     rolling efficiency averages the device state does not.
 *
 * So: prefer the device numbers for total/EV/HEV, fall back to the trip reading
 * when the car didn't report them, and always take the efficiency figures from
 * the trip log. `composeOdo` merges the latest of each under that precedence.
 */
let lastTripOdo: Odometer | null = odometer.value
let lastDeviceOdo: DeviceOdometer | null = null

/** A positive, finite, rounded km reading, or null when absent/zero. */
function kmOrNull(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : null
}

/** Pull a usable odometer out of a device-state `odometer` block, or null. */
function deviceOdo(m: DeviceOdometer | undefined): DeviceOdometer | null {
  if (!m) return null
  const totalKm = kmOrNull(m.totalKm)
  const evKm = kmOrNull(m.evKm)
  const hevKm = kmOrNull(m.hevKm)
  if (totalKm == null && evKm == null && hevKm == null) return null
  return { totalKm: totalKm ?? undefined, evKm: evKm ?? undefined, hevKm: hevKm ?? undefined }
}

function sameOdo(a: DeviceOdometer | null, b: DeviceOdometer | null): boolean {
  return a?.totalKm === b?.totalKm && a?.evKm === b?.evKm && a?.hevKm === b?.hevKm
}

/** Device state reported the odometer: adopt it (it wins) and recompose on change. */
function noteDeviceOdo(m: DeviceOdometer | undefined): void {
  const dm = deviceOdo(m)
  if (!dm || sameOdo(dm, lastDeviceOdo)) return
  lastDeviceOdo = dm
  composeOdo()
}

/** Merge device + trip readings under the precedence above and publish them. */
function composeOdo(): void {
  const dev = lastDeviceOdo
  const trip = lastTripOdo
  if (!dev && !trip) return
  const merged: Odometer = {
    totalKm: dev?.totalKm ?? trip?.totalKm ?? null,
    evKm: dev?.evKm ?? trip?.evKm ?? null,
    hevKm: dev?.hevKm ?? trip?.hevKm ?? null,
    fuelLPer100: trip?.fuelLPer100 ?? null,
    recentKwhPer100: trip?.recentKwhPer100 ?? null,
    recentLPer100: trip?.recentLPer100 ?? null,
    recentKm: trip?.recentKm ?? null,
  }
  odometer.value = merged
  try {
    if (merged.totalKm != null || merged.evKm != null || merged.hevKm != null) {
      localStorage.setItem(K_ODO, JSON.stringify(merged))
    } else {
      localStorage.removeItem(K_ODO) // definitively nothing to remember
    }
  } catch { /* private mode / quota — not worth failing over */ }
}
/**
 * Outside air temperature. Cabin temperature is what the dashboard would prefer,
 * but OverDrive only sends climate.insideTempC while the sensor is answering
 * (hasFreshCabinTemperature) — on a parked car it is usually absent, which left
 * the tile showing "--" forever. This rides the same slow poll so the tile can
 * fall back to something real.
 */
export const outsideTempC = signal<number | null>(null)
/** Particulates (µg/m³) inside and outside the cabin, on the same slow poll. */
export const pm25Inside = signal<number | null>(null)
export const pm25Outside = signal<number | null>(null)
let odoAt = 0
const ODO_INTERVAL_MS = 60_000
/** Consecutive /api/vehicle/state failures; past 3 the last reading is dropped. */
let vsFails = 0

// Charging estimate (minutes to full) + target %, fetched only while charging.
export const chargeEtaMin = signal<number | null>(null)
export const chargeTargetPct = signal<number | null>(null)
/*
 * Usable pack capacity (kWh), from the launcher summary. Only used to estimate
 * a time-to-full when the car has not produced one yet — see ChargingCard.
 */
/*
 * Remembered across launches.
 *
 * Capacity is a fixed property of the car, and it arrives on the same endpoint
 * as etaMin — so if that endpoint fails or is missing on an older OverDrive,
 * BOTH go null and the estimate that exists to cover a missing etaMin cannot
 * run either. Caching it means one successful reading, ever, is enough.
 */
const K_KWH = 'odpwa.kwh'
function readCachedKwh(): number | null {
  const v = Number(localStorage.getItem(K_KWH))
  return isFinite(v) && v > 0 ? v : null
}
export const batteryKwh = signal<number | null>(readCachedKwh())
export const lastError = signal<string | null>(null)
/** Set when the backend rejects our JWT — the app drops back to the setup screen. */
export const authLost = signal(false)

// Whether BYD Cloud is configured (the lock/unlock/flash/find/trunk controls need
// it). null = not yet known. Cached in localStorage so not-configured users never
// see the cloud buttons flash in on load.
const K_CLOUD = 'odpwa.cloud'
function readCloud(): boolean | null {
  const v = localStorage.getItem(K_CLOUD)
  return v === null ? null : v === '1'
}
export const cloudConfigured = signal<boolean | null>(readCloud())
// Whether the on-device remote-key rail exists — the path vehicle power rides.
// Gates the Power on/off buttons, exactly as OverDrive's dashboard does. Cached
// so the buttons don't flash in/out on load. null = not yet known.
const K_LOCALKEY = 'odpwa.localkey'
function readLocalKey(): boolean | null {
  const v = localStorage.getItem(K_LOCALKEY)
  return v === null ? null : v === '1'
}
export const localRemoteKey = signal<boolean | null>(readLocalKey())
let cloudFetched = false
/*
 * SL6VN Cloud answers cloud-status too, but from its own point of view (it has
 * no BYD Cloud account, and runs power through the car's remote-key rail). That
 * answer never changes, so it is asked for once per cloud session and kept here,
 * in memory only: while the cloud serves the app it stands in for the car's,
 * and the moment the tunnel is back the car's persisted answer is put back.
 */
let cloudAnswer: CloudStatus | null = null
let cloudAsked = false // once per cloud session
let showingCloudAnswer = false
// A car-side ask the cloud answered instead: the car is asked again, but not every tick.
let carAskedAt = 0
const CAR_ASK_MS = 60_000

/** On the cloud: show its answer (never persisted), asking for it the first time only. */
function useCloudAnswer(): void {
  if (!cloudAnswer) {
    if (!cloudAsked) {
      cloudAsked = true
      void fetchCloud()
    }
    return
  }
  if (showingCloudAnswer) return
  showingCloudAnswer = true
  cloudConfigured.value = !!cloudAnswer.configured
  localRemoteKey.value = !!cloudAnswer.localRemoteKey
}

/** Back on the tunnel: the car's own (persisted) answer again. */
function dropCloudAnswer(): void {
  if (!showingCloudAnswer) return
  showingCloudAnswer = false
  cloudConfigured.value = readCloud()
  localRemoteKey.value = readLocalKey()
}

async function fetchCloud(): Promise<void> {
  try {
    const s = await getCloudStatus()
    if (!active) return // signed out while in flight — don't rewrite what reset() cleared
    // The cloud's own answer must not rewrite the car's: keep it aside, and ask
    // the car again once the tunnel is back.
    if (s.source === 'cloud') {
      cloudFetched = false
      cloudAnswer = s
      if (dataSource.value === 'cloud') useCloudAnswer()
      return
    }
    cloudFetched = true
    showingCloudAnswer = false
    const c = !!s.configured
    cloudConfigured.value = c
    localStorage.setItem(K_CLOUD, c ? '1' : '0')
    const lk = !!s.localRemoteKey
    localRemoteKey.value = lk
    localStorage.setItem(K_LOCALKEY, lk ? '1' : '0')
  } catch { /* ignore — leave cached value */ }
}

const POLL_OK = 5000
const POLL_RETRY = 2000
const POLL_HIDDEN = 60000 // tab in the background
/*
 * On SL6VN Cloud with its live socket down. Every request is paid for out of
 * the cloud's free plan, and its data is only as fresh as the car's last report
 * anyway — no point asking three times as often as the car can answer.
 */
const POLL_CLOUD = 15_000
/** The live socket is still coming up: look again shortly instead of polling the cloud meanwhile. */
const LIVE_GRACE_MS = 3_000

/*
 * The cloud's live socket (lib/live.ts). Up only while the cloud is what serves
 * the app — "Use cloud only", or the tunnel down and the cloud answering — with
 * a usable session for this car, and the app in view. While it delivers, the
 * poll asks the cloud nothing: each snapshot fills the same signals a poll
 * would. The tunnel is still probed (see tick), so the app goes back to it as
 * soon as it recovers — which closes the socket.
 */
const live = new LiveLink({
  onMessage: (m) => {
    if (active) applyLive(m)
  },
  // 4001 is a cloud 401: drop the session (which also ends "Use cloud only").
  onRejected: (url) => {
    cloudLiveRejected(url)
    syncLive()
    requestNow() // back to the tunnel now, not at the next cloud-paced tick
  },
})
let unwatch: (() => void) | null = null

function syncLive(): void {
  const want = active && !document.hidden && cloudUsable() && (cloudOnly.value || dataSource.value === 'cloud')
  live.want((want && cloudLiveUrl()) || null)
}

let timer: ReturnType<typeof setTimeout> | null = null
let active = false
let listenerBound = false
let running = false // a tick() is currently in flight
let pending = false // an immediate poll was requested during an in-flight tick

function schedule(ms: number): void {
  if (!active) return
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(runTick, ms)
}

/** Request an immediate poll, coalesced with any in-flight tick (no overlap). */
function requestNow(): void {
  if (!active) return
  if (running) {
    pending = true
    return
  }
  schedule(0)
}

/** Single-flight wrapper around tick(): never runs two ticks concurrently. */
async function runTick(): Promise<void> {
  if (running) {
    pending = true
    return
  }
  running = true
  try {
    await tick()
  } finally {
    running = false
    if (pending && active) {
      pending = false
      schedule(0) // honor a refresh that arrived mid-tick
    }
  }
}

/*
 * What a reading does to the app, whichever way it came — the poll or the
 * cloud's live socket. One place each, so the two can never disagree.
 */
function applyStatus(s: StatusResponse): void {
  status.value = s
  connected.value = true
  lastError.value = null
}

function applyVehicleState(vs: VehicleState): void {
  vehicleState.value = vs
  vsFails = 0
  // The device state carries the odometer now — prefer it, live, every poll.
  noteDeviceOdo(vs.odometer)
}

/** Charging time-to-full only means anything while charging or plugged in. */
const wantsCharge = (s: StatusResponse): boolean => !!(s.charging?.charging || s.charging?.plugged)

function applySummary(sum: LauncherSummary, forEnv: boolean, forCharge: boolean): void {
  if (forEnv) {
    const num = (v: unknown) => (typeof v === 'number' ? v : null)
    outsideTempC.value = num(sum.env?.tempC)
    pm25Inside.value = num(sum.air?.pm25Inside)
    pm25Outside.value = num(sum.air?.pm25Outside)
  }
  if (forCharge) {
    chargeEtaMin.value = sum.charging?.etaMin ?? null
    chargeTargetPct.value = sum.charging?.targetPct ?? null
    const kwh = sum.battery?.usableKwh
    if (typeof kwh === 'number' && kwh > 0) {
      batteryKwh.value = kwh
      try {
        localStorage.setItem(K_KWH, String(kwh))
      } catch { /* private mode / quota */ }
    }
  }
}

function clearCharge(): void {
  chargeEtaMin.value = null
  chargeTargetPct.value = null
}

/** A message from the cloud's live socket: what a cloud poll would have brought. */
function applyLive(m: LiveMessage): void {
  if (m.type === 'nodata') {
    // Never reported — what a cloud /status says too (as a 503): offline as far as anyone knows.
    connected.value = false
    lastError.value = t('cloud.car_offline')
    return
  }
  batch(() => {
    applyStatus(m.status)
    dataSource.value = 'cloud'
    if (m.state) applyVehicleState(m.state)
    // The socket brings the summary with every report, so it costs nothing to
    // take all of it, every time.
    const charge = wantsCharge(m.status)
    if (m.summary) applySummary(m.summary, true, charge)
    if (!charge) clearCharge()
    useCloudAnswer()
  })
}

async function tick(): Promise<void> {
  // A cloud token can lapse while the app sits open; Settings should say so.
  syncCloudState()
  if (cloudState.value !== 'on') {
    // A new cloud session asks the cloud's cloud-status afresh.
    cloudAnswer = null
    cloudAsked = false
  }
  syncLive()
  try {
    let s: StatusResponse
    if (live.state !== 'off') {
      /*
       * The cloud's socket is up, or coming up, and brings everything a cloud
       * poll would — so no cloud request at all. What is left is to notice the
       * tunnel coming back: asked on the breaker's schedule, and never in "Use
       * cloud only". Only the car's own answer counts; anything else waits.
       */
      const back = await getTunnelStatus().catch((e: unknown) => {
        if (e instanceof AuthError) throw e
        return null
      })
      if (!active) return
      if (!back) {
        schedule(live.state === 'live' ? POLL_CLOUD : LIVE_GRACE_MS)
        return
      }
      s = back
    } else {
      s = await getStatus()
    }
    if (!active) return // dropped during sign-out / auth-loss
    applyStatus(s)
    if (dataSource.value === 'tunnel') {
      // The tunnel just answered, so its session is good — the one thing a
      // cloud token renewal needs. Every such tick, because a session can be
      // lost mid-visit; maybeRefreshCloud does nothing unless the token needs it,
      // and rate-limits itself. Silent either way.
      maybeRefreshCloud()
      // Same moment is right for keeping the car's cloud setup current: it needs the tunnel.
      // Once per app start, and a no-op once this phone applied the cloud's current version.
      void migrateCarSetup()
      dropCloudAnswer()
    }
    if (dataSource.value === 'cloud') {
      useCloudAnswer()
    } else if (!cloudFetched && Date.now() - carAskedAt >= CAR_ASK_MS) {
      cloudFetched = true
      carAskedAt = Date.now()
      void fetchCloud() // once per session; don't block the poll
    }
    const wantEnv = Date.now() - odoAt > ODO_INTERVAL_MS
    const wantCharge = wantsCharge(s)
    // The trip log is not on SL6VN Cloud, so while it stands in the odometer
    // keeps its last reading rather than spending a request on a dead tunnel.
    if (wantEnv && dataSource.value !== 'cloud') {
      // Fire-and-forget: the odometer is nice-to-have, and a missing debug
      // route must never take the telemetry poll down with it.
      void getOdometer()
        .then((o) => {
          // null means the car said nothing — keep whatever we already had.
          // The trip log is the fallback for total/EV/HEV and the only source of
          // the efficiency averages; the device numbers still win in composeOdo.
          if (!active || !o) return
          lastTripOdo = o
          composeOdo()
        })
        .catch(() => {})
    }
    // Control-surface detail; failure here shouldn't knock out the whole poll.
    try {
      const vs = await getVehicleState()
      if (active) applyVehicleState(vs)
    } catch (e) {
      if (e instanceof AuthError) throw e
      /*
       * Keeping the last good reading through a blip is right; keeping it
       * forever is not. /status can stay healthy while this one route fails, and
       * then the card goes on saying "Doors · Locked" from a reading taken
       * hours ago, under a green dot, with nothing to distinguish it from live.
       * After three misses (~15 s) drop it, so the UI shows "no data" instead
       * of a confident lie about whether the car is locked.
       */
      if (active && ++vsFails >= 3) vehicleState.value = null
    }
    /*
     * One /summary per tick, fire-and-forget like the odometer above.
     *
     * It used to be awaited here. getSummary carries a 15s timeout, so a single
     * hanging request stalled the WHOLE poll for that long — the next tick is
     * only scheduled after this function returns, so a slow supplementary call
     * froze SOC, power and door state along with it. The ETA is nice to have;
     * telemetry is not.
     *
     * There is no explicit retry, and none is needed: the poll comes round every
     * 5s while the cable is in, so each tick IS the retry. A failed attempt
     * leaves the previous values in place rather than blanking them.
     */
    if (wantEnv) odoAt = Date.now()
    if (active && (wantEnv || wantCharge)) {
      const forEnv = wantEnv
      const forCharge = wantCharge
      void getSummary()
        .then((sum) => {
          if (active) applySummary(sum, forEnv, forCharge)
        })
        .catch((e) => {
          if (e instanceof AuthError) {
            /*
             * Detached from the tick's own try/catch now, so a rejected JWT has
             * to be acted on here — rethrowing would only produce an unhandled
             * rejection and leave the app polling a car that has signed it out.
             */
            authLost.value = true
            stop()
            return
          }
          // A 404 on an older OverDrive looks exactly like a car with no ETA
          // yet; this line is the only way to tell them apart from a phone.
          console.warn('summary poll failed:', e instanceof Error ? e.message : e)
        })
    }
    if (active && !wantCharge) clearCharge()
    schedule(document.hidden ? POLL_HIDDEN : dataSource.value === 'cloud' ? POLL_CLOUD : POLL_OK)
  } catch (e) {
    if (e instanceof AuthError) {
      authLost.value = true
      stop()
      return
    }
    if (!active) return
    connected.value = false
    lastError.value = e instanceof Error ? e.message : 'Error'
    // A cloud that answered "no" is not asked again every two seconds.
    schedule(cloudRouted() ? POLL_CLOUD : POLL_RETRY)
  }
}

export function start(): void {
  if (active) return
  active = true
  // Whatever moves the app onto or off the cloud opens or closes the live socket.
  unwatch = effect(() => {
    void cloudOnly.value
    void cloudState.value
    void dataSource.value
    syncLive()
  })
  if (!listenerBound) {
    listenerBound = true
    // Back in view or back online: the tunnel gets a fresh try before the
    // cloud, whatever the breaker remembers from before. Out of view, the live
    // socket closes; the hidden-tab poll is slow enough on its own.
    document.addEventListener('visibilitychange', () => {
      if (!active) return
      syncLive()
      if (!document.hidden) {
        resetBreaker()
        live.kick()
        requestNow()
      }
    })
    // Poll immediately when the network comes back.
    window.addEventListener('online', () => {
      resetBreaker()
      live.kick()
      requestNow()
    })
  }
  runTick()
}

export function stop(): void {
  active = false
  pending = false
  unwatch?.()
  unwatch = null
  live.want(null)
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

/** Force an immediate poll (e.g. after firing a control), never overlapping. */
export function refresh(): void {
  requestNow()
}

export function reset(): void {
  stop()
  status.value = null
  vehicleState.value = null
  connected.value = false
  dataSource.value = null
  lastError.value = null
  chargeEtaMin.value = null
  chargeTargetPct.value = null
  batteryKwh.value = null
  localStorage.removeItem(K_KWH)
  odometer.value = null
  lastTripOdo = null
  lastDeviceOdo = null
  localStorage.removeItem(K_ODO)
  outsideTempC.value = null
  pm25Inside.value = null
  pm25Outside.value = null
  odoAt = 0
  vsFails = 0
  authLost.value = false
  cloudConfigured.value = null
  localRemoteKey.value = null
  cloudFetched = false
  cloudAnswer = null
  cloudAsked = false
  showingCloudAnswer = false
  carAskedAt = 0
  localStorage.removeItem(K_CLOUD)
  localStorage.removeItem(K_LOCALKEY)
}
