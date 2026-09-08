import { signal } from '@preact/signals'
import { AuthError, getCloudStatus, getStatus, getSummary, getVehicleState } from './api'
import type { StatusResponse, VehicleState } from './types'

export const status = signal<StatusResponse | null>(null)
export const vehicleState = signal<VehicleState | null>(null)
export const connected = signal(false)
// Charging estimate (minutes to full) + target %, fetched only while charging.
export const chargeEtaMin = signal<number | null>(null)
export const chargeTargetPct = signal<number | null>(null)
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
    // Control-surface detail; failure here shouldn't knock out the whole poll.
    try {
      const vs = await getVehicleState()
      if (active) vehicleState.value = vs
    } catch (e) {
      if (e instanceof AuthError) throw e
    }
    // Charging time-to-full: only while charging/plugged (extra call otherwise wasteful).
    if (active && (s.charging?.charging || s.charging?.plugged)) {
      try {
        const sum = await getSummary()
        if (active) {
          chargeEtaMin.value = sum.charging?.etaMin ?? null
          chargeTargetPct.value = sum.charging?.targetPct ?? null
        }
      } catch (e) {
        if (e instanceof AuthError) throw e
      }
    } else if (active) {
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
  authLost.value = false
  cloudConfigured.value = null
  cloudFetched = false
  localStorage.removeItem(K_CLOUD)
}
