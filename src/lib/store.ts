import { signal } from '@preact/signals'
import { AuthError, getCloudStatus, getOdometer, getStatus, getSummary, getVehicleState } from './api'
import type { Odometer } from './api'
import type { StatusResponse, VehicleState } from './types'

export const status = signal<StatusResponse | null>(null)
export const vehicleState = signal<VehicleState | null>(null)
export const connected = signal(false)
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
    return { totalKm, evKm: num(c.evKm), hevKm: num(c.hevKm) }
  } catch {
    return null
  }
}

export const odometer = signal<Odometer | null>(readCachedOdo())
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
let cloudFetched = false

async function fetchCloud(): Promise<void> {
  try {
    const s = await getCloudStatus()
    if (!active) return // signed out while in flight — don't rewrite what reset() cleared
    const c = !!s.configured
    cloudConfigured.value = c
    localStorage.setItem(K_CLOUD, c ? '1' : '0')
  } catch { /* ignore — leave cached value */ }
}

const POLL_OK = 5000
const POLL_RETRY = 2000
const POLL_HIDDEN = 60000 // tab in the background

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

async function tick(): Promise<void> {
  try {
    const s = await getStatus()
    if (!active) return // dropped during sign-out / auth-loss
    status.value = s
    connected.value = true
    lastError.value = null
    if (!cloudFetched) {
      cloudFetched = true
      void fetchCloud() // once per session; don't block the poll
    }
    const wantEnv = Date.now() - odoAt > ODO_INTERVAL_MS
    // Charging time-to-full: only while charging/plugged (extra call otherwise wasteful).
    const wantCharge = !!(s.charging?.charging || s.charging?.plugged)
    if (wantEnv) {
      odoAt = Date.now()
      // Fire-and-forget: the odometer is nice-to-have, and a missing debug
      // route must never take the telemetry poll down with it.
      void getOdometer()
        .then((o) => {
          // null means the car said nothing — keep whatever we already had.
          if (!active || !o) return
          odometer.value = o
          try {
            if (o.totalKm != null) localStorage.setItem(K_ODO, JSON.stringify(o))
            else localStorage.removeItem(K_ODO) // definitively has none; stop remembering
          } catch { /* private mode / quota — the reading is not worth failing over */ }
        })
        .catch(() => {})
    }
    // Control-surface detail; failure here shouldn't knock out the whole poll.
    try {
      const vs = await getVehicleState()
      if (active) {
        vehicleState.value = vs
        vsFails = 0
      }
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
    if (active && (wantEnv || wantCharge)) {
      const forEnv = wantEnv
      const forCharge = wantCharge
      void getSummary()
        .then((sum) => {
          if (!active) return
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
    if (active && !wantCharge) {
      chargeEtaMin.value = null
      chargeTargetPct.value = null
    }
    schedule(document.hidden ? POLL_HIDDEN : POLL_OK)
  } catch (e) {
    if (e instanceof AuthError) {
      authLost.value = true
      stop()
      return
    }
    if (!active) return
    connected.value = false
    lastError.value = e instanceof Error ? e.message : 'Error'
    schedule(POLL_RETRY)
  }
}

export function start(): void {
  if (active) return
  active = true
  if (!listenerBound) {
    listenerBound = true
    document.addEventListener('visibilitychange', () => {
      if (active && !document.hidden) requestNow()
    })
    // Poll immediately when the network comes back.
    window.addEventListener('online', requestNow)
  }
  runTick()
}

export function stop(): void {
  active = false
  pending = false
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
  lastError.value = null
  chargeEtaMin.value = null
  chargeTargetPct.value = null
  batteryKwh.value = null
  localStorage.removeItem(K_KWH)
  odometer.value = null
  localStorage.removeItem(K_ODO)
  outsideTempC.value = null
  pm25Inside.value = null
  pm25Outside.value = null
  odoAt = 0
  vsFails = 0
  authLost.value = false
  cloudConfigured.value = null
  cloudFetched = false
  localStorage.removeItem(K_CLOUD)
}
