import { signal } from '@preact/signals'
import { cloudHistoryGet, cloudHistoryPost, getDeviceId, historySyncReady, tunnelGet } from './api'
import type { ChargingSession, TripConfig, TripRow } from './types'

/*
 * Copies trip / charging / trip-config history from the car (through the tunnel
 * only) up to SL6VN Cloud, so the cloud can answer those reads when the tunnel
 * is down. The cloud's cursor (latest startTime it holds, per kind) is the only
 * bookkeeping: a failed run is resumed by the next one from wherever the server
 * says it got to. The server upserts on (car, startTime), so overlap is harmless.
 */
const DAY = 24 * 3600 * 1000
export const BATCH_ROWS = 200
export const PAGE_ROWS = 200
export const MAX_PAGES = 50
export const SYNC_EVERY_MS = 30 * 60_000
export const BACKOFF_MIN_MS = 5 * 60_000
export const BACKOFF_MAX_MS = 60 * 60_000
/** A visibility flip right after a run is not worth another one. */
const MIN_GAP_MS = 60_000
const K_CFG = 'odpwa.cloudHistCfg.'

export interface HistorySyncState {
  state: 'idle' | 'syncing' | 'error'
  lastOk?: number
  pushed?: { trips: number; sessions: number }
}
export const historySync = signal<HistorySyncState>({ state: 'idle' })

interface Cursor { success?: boolean; trips?: number; sessions?: number; config?: number }
type Kind = 'trips' | 'sessions'

/** The `from` of a range read: one day before the cursor, or 0 (all history) on a first sync. */
export function fromFor(cursor: number): number {
  return cursor > 0 ? Math.max(0, cursor - DAY) : 0
}

const start = (r: { startTime?: number }): number => Number(r.startTime) || 0

/** Completed rows at or after cursor - 1 day, oldest first. */
export function pending<T extends { startTime?: number; inProgress?: boolean; chargingNow?: boolean }>(
  rows: T[] | undefined, cursor: number,
): T[] {
  const from = fromFor(cursor)
  return (rows ?? [])
    .filter((r) => r && !r.inProgress && !r.chargingNow && start(r) > 0 && start(r) >= from)
    .sort((a, b) => start(a) - start(b))
}

/** Pushes rows in batches; returns how many went up and whether every batch did. */
async function push(kind: Kind, rows: unknown[]): Promise<{ sent: number; ok: boolean }> {
  let sent = 0
  for (let i = 0; i < rows.length; i += BATCH_ROWS) {
    const batch = rows.slice(i, i + BATCH_ROWS)
    try {
      await cloudHistoryPost('/api/cloud/history', { [kind]: batch })
    } catch {
      return { sent, ok: false } // the next run resumes from the server cursor
    }
    sent += batch.length
  }
  return { sent, ok: true }
}

const cfgKey = (): string => K_CFG + getDeviceId()
const hash = (s: string): string => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return String(h >>> 0)
}

/** Every row of a range read, paged until a short page. A failed page throws. */
async function readAll<T>(path: string, key: 'trips' | 'sessions', cursor: number, now: number): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await tunnelGet<Record<string, T[] | undefined>>(
      `${path}?from=${fromFor(cursor)}&to=${now + DAY}&limit=${PAGE_ROWS}&offset=${page * PAGE_ROWS}`)
    const rows = r[key] ?? []
    out.push(...rows)
    if (rows.length < PAGE_ROWS) break
  }
  return out
}

async function run(): Promise<void> {
  if (!historySyncReady()) return
  const now = Date.now()
  historySync.value = { ...historySync.value, state: 'syncing' }
  const pushed = { trips: 0, sessions: 0 }
  let ok = true
  try {
    const cur = await cloudHistoryGet<Cursor>('/api/cloud/history/cursor')
    const trips = Number(cur.trips) || 0
    const sessions = Number(cur.sessions) || 0
    // Tunnel reads come first, all of them: if the tunnel is down nothing is pushed.
    const tripRows = await readAll<TripRow>('/api/trips', 'trips', trips, now)
    const sessRows = await readAll<ChargingSession>('/api/charging', 'sessions', sessions, now)
    const cfg = (await tunnelGet<TripConfig>('/api/trips/config')).config

    const t = await push('trips', pending<TripRow>(tripRows, trips))
    pushed.trips = t.sent
    const s = await push('sessions', pending<ChargingSession>(sessRows, sessions))
    pushed.sessions = s.sent
    ok = t.ok && s.ok

    if (cfg && typeof cfg === 'object') {
      const h = hash(JSON.stringify(cfg))
      if (localStorage.getItem(cfgKey()) !== h) {
        try {
          await cloudHistoryPost('/api/cloud/history', { config: cfg })
          localStorage.setItem(cfgKey(), h)
        } catch { ok = false }
      }
    }
  } catch {
    ok = false
  }
  historySync.value = ok
    ? { state: 'idle', lastOk: Date.now(), pushed }
    : { ...historySync.value, state: 'error', pushed }
  failures = ok ? 0 : failures + 1
}

let inflight: Promise<void> | null = null
let failures = 0
let lastRun = 0

/** One sync run; concurrent callers share it. A no-op unless the cloud and the tunnel are both usable. */
export function syncHistory(): Promise<void> {
  if (!inflight) {
    lastRun = Date.now()
    inflight = run().finally(() => { inflight = null })
  }
  return inflight
}

/** Milliseconds to wait after the current run of failures: 5 min, doubling, up to 60. */
export function backoffMs(n: number = failures): number {
  return n <= 0 ? 0 : Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (n - 1))
}

const backedOff = (): boolean => failures > 0 && Date.now() - lastRun < backoffMs()

/** A trigger's run: skipped while backing off. */
function tick(): Promise<void> {
  return backedOff() ? Promise.resolve() : syncHistory()
}

let timer: ReturnType<typeof setTimeout> | undefined
let started = false

function schedule(): void {
  clearTimeout(timer)
  const wait = failures > 0 ? backoffMs() : SYNC_EVERY_MS
  timer = setTimeout(() => {
    const go = document.visibilityState === 'visible' ? tick() : Promise.resolve()
    void go.finally(schedule)
  }, wait)
}

/** Starts the triggers: now, whenever the app turns visible, and a single repeating timer. Idempotent. */
export function startHistorySync(): void {
  if (started) return
  started = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRun >= MIN_GAP_MS) {
      void tick().finally(schedule)
    }
  })
  void tick().finally(schedule)
}

/** Test seam: forget timers and backoff. */
export function stopHistorySync(): void {
  clearTimeout(timer)
  started = false
  failures = 0
  lastRun = 0
}
