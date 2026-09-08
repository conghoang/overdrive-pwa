import { signal } from '@preact/signals'
import { AuthError, getStatus, getVehicleState } from './api'
import type { StatusResponse, VehicleState } from './types'

export const status = signal<StatusResponse | null>(null)
export const vehicleState = signal<VehicleState | null>(null)
export const connected = signal(false)
export const lastError = signal<string | null>(null)
/** Set when the backend rejects our JWT — the app drops back to the setup screen. */
export const authLost = signal(false)

const POLL_OK = 5000
const POLL_RETRY = 2000
const POLL_HIDDEN = 60000

let timer: ReturnType<typeof setTimeout> | null = null
let active = false
let listenerBound = false

function schedule(ms: number): void {
  if (!active) return
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(tick, ms)
}

async function tick(): Promise<void> {
  try {
    const s = await getStatus()
    status.value = s
    connected.value = true
    lastError.value = null
    // Control-surface detail; failure here shouldn't knock out the whole poll.
    try {
      vehicleState.value = await getVehicleState()
    } catch (e) {
      if (e instanceof AuthError) throw e
    }
    schedule(document.hidden ? POLL_HIDDEN : POLL_OK)
  } catch (e) {
    if (e instanceof AuthError) {
      authLost.value = true
      stop()
      return
    }
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
      if (active && !document.hidden) schedule(0)
    })
  }
  tick()
}

export function stop(): void {
  active = false
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

/** Force an immediate poll (e.g. after firing a control). */
export function refresh(): void {
  if (active) schedule(0)
}

export function reset(): void {
  stop()
  status.value = null
  vehicleState.value = null
  connected.value = false
  lastError.value = null
}
