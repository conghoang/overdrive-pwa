import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CAR = 'https://car.example'
const DEV = 'byd-e1019f3e'
const CLOUD = 'https://cloud.sl6vn.link'
const NOW = 1_800_000_000_000
const DAY = 24 * 3600 * 1000
const HIST = CLOUD + '/api/cloud/history'

type Call = { url: string; init: RequestInit }
let calls: Call[]
let handler: (url: string, init: RequestInit) => Response | Promise<Response>
let cursor: { trips: number; sessions: number; config: number }
let tunnel: { trips: { startTime: number; inProgress?: boolean }[]; sessions: { startTime: number }[]; config: object }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const down = () => Promise.reject(new TypeError('Failed to fetch'))
const rows = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({ startTime: from + i }))
const posts = () => calls.filter((c) => c.url === HIST).map((c) => JSON.parse(c.init.body as string))
const cloudCalls = () => calls.filter((c) => c.url.startsWith(CLOUD))
const tunnelCalls = () => calls.filter((c) => c.url.startsWith(CAR))

const page = <T,>(url: string, all: T[]): T[] => {
  const o = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0)
  const l = Number(/limit=(\d+)/.exec(url)?.[1] ?? all.length)
  return all.slice(o, o + l)
}

function defaultHandler(url: string): Response | Promise<Response> {
  if (url === CLOUD + '/api/cloud/history/cursor') return json({ success: true, ...cursor })
  if (url === HIST) return json({ success: true })
  if (url.startsWith(CAR + '/api/trips/config')) return json({ success: true, config: tunnel.config })
  if (url.startsWith(CAR + '/api/trips')) return json({ success: true, trips: page(url, tunnel.trips) })
  if (url.startsWith(CAR + '/api/charging?')) return json({ success: true, sessions: page(url, tunnel.sessions) })
  return json({})
}

let docListeners: Record<string, () => void>
function stubDoc(state = 'visible') {
  docListeners = {}
  vi.stubGlobal('document', {
    documentElement: { lang: '' },
    visibilityState: state,
    addEventListener: (ev: string, fn: () => void) => { docListeners[ev] = fn },
  })
}

async function load() {
  vi.resetModules()
  const api = await import('./api')
  const hs = await import('./history-sync')
  return { api, hs }
}
function signIn() {
  localStorage.setItem('odpwa.baseUrl', CAR)
  localStorage.setItem('odpwa.jwt', 'tunnel-jwt')
  localStorage.setItem('odpwa.deviceId', DEV)
}
function enroll() {
  localStorage.setItem('odpwa.odcloud.token', 'cloud-tok')
  localStorage.setItem('odpwa.odcloud.exp', String(NOW + 30 * DAY))
  localStorage.setItem('odpwa.odcloud.device', DEV)
}

beforeEach(() => {
  localStorage.clear()
  calls = []
  cursor = { trips: 0, sessions: 0, config: 0 }
  tunnel = { trips: [], sessions: [], config: { enabled: true } }
  handler = defaultHandler
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return handler(url, init)
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('preconditions', () => {
  it('does nothing without cloud', async () => {
    signIn()
    const { hs } = await load()
    await hs.syncHistory()
    expect(calls).toEqual([])
  })
  it('does nothing for another car', async () => {
    signIn(); enroll()
    localStorage.setItem('odpwa.odcloud.device', 'byd-other')
    const { hs } = await load()
    await hs.syncHistory()
    expect(calls).toEqual([])
  })
  it('does nothing in demo', async () => {
    signIn(); enroll()
    localStorage.setItem('odpwa.baseUrl', 'demo')
    const { hs } = await load()
    await hs.syncHistory()
    expect(calls).toEqual([])
  })
  it('does nothing in cloud-only mode', async () => {
    signIn(); enroll()
    const { api, hs } = await load()
    api.setCloudOnly(true)
    await hs.syncHistory()
    expect(calls).toEqual([])
  })
})

describe('range from the cursor', () => {
  it('from is cursor - 1 day, or 0 on a first sync', async () => {
    const { hs } = await load()
    expect(hs.fromFor(0)).toBe(0)
    expect(hs.fromFor(10 * DAY)).toBe(9 * DAY)
    expect(hs.fromFor(DAY / 2)).toBe(0)
  })
  it('first sync asks for from=0 on /api/charging, to = now + 1 day', async () => {
    signIn(); enroll()
    cursor = { trips: NOW - 3 * DAY, sessions: 0, config: 0 }
    const { hs } = await load()
    await hs.syncHistory()
    const t = tunnelCalls().map((c) => c.url)
    expect(t).toContain(`${CAR}/api/trips?from=${NOW - 4 * DAY}&to=${NOW + DAY}&limit=200&offset=0`)
    expect(t).toContain(`${CAR}/api/charging?from=0&to=${NOW + DAY}&limit=200&offset=0`)
    expect(t.some((u) => u.includes('/overview'))).toBe(false)
  })
})

describe('paging', () => {
  it('pages by offset until a short page', async () => {
    signIn(); enroll()
    const all = rows(450).reverse() // newest first, as OD returns
    handler = (url) => {
      const m = /^https:\/\/car\.example\/api\/trips\?.*limit=(\d+)&offset=(\d+)/.exec(url)
      return m ? json({ success: true, trips: all.slice(+m[2], +m[2] + +m[1]) }) : defaultHandler(url)
    }
    const { hs } = await load()
    await hs.syncHistory()
    const pages = tunnelCalls().filter((c) => c.url.includes('/api/trips?')).map((c) => /offset=(\d+)/.exec(c.url)![1])
    expect(pages).toEqual(['0', '200', '400'])
    expect(hs.historySync.value.pushed?.trips).toBe(450)
  })
  it('a full last page asks for one more; caps at 50 pages', async () => {
    signIn(); enroll()
    handler = (url) => (url.startsWith(CAR + '/api/trips?') ? json({ success: true, trips: rows(200) }) : defaultHandler(url))
    const { hs } = await load()
    await hs.syncHistory()
    expect(tunnelCalls().filter((c) => c.url.includes('/api/trips?'))).toHaveLength(50)
  })
  it('a failed page aborts the run: nothing pushed', async () => {
    signIn(); enroll()
    handler = (url) => (url.includes('/api/trips?') && url.includes('offset=200') ? down() : url.startsWith(CAR + '/api/trips?') ? json({ trips: rows(200) }) : defaultHandler(url))
    const { hs } = await load()
    await hs.syncHistory()
    expect(posts()).toEqual([])
    expect(hs.historySync.value.state).toBe('error')
  })
})

describe('filtering and batching', () => {
  it('pushes 450 rows as 3 batches, oldest first, with the cloud token', async () => {
    signIn(); enroll()
    tunnel.trips = rows(450).reverse()
    const { hs } = await load()
    await hs.syncHistory()
    const t = posts().filter((p) => p.trips)
    expect(t.map((p) => p.trips.length)).toEqual([200, 200, 50])
    expect(t[0].trips[0].startTime).toBe(1)
    expect(t[2].trips[49].startTime).toBe(450)
    expect(calls.filter((c) => c.url === HIST)[0].init.headers).toMatchObject({ Authorization: 'Bearer cloud-tok' })
    expect(hs.historySync.value.pushed).toEqual({ trips: 450, sessions: 0 })
    expect(hs.historySync.value.state).toBe('idle')
  })
  it('drops in-progress rows and rows older than cursor - 1 day', async () => {
    signIn(); enroll()
    const c = 10 * DAY
    cursor = { trips: c, sessions: 0, config: 0 }
    tunnel.trips = [{ startTime: c - DAY - 1 }, { startTime: c - DAY }, { startTime: c + 5, inProgress: true }, { startTime: c + 9 }]
    const { hs } = await load()
    await hs.syncHistory()
    expect(posts().find((p) => p.trips).trips.map((r: { startTime: number }) => r.startTime)).toEqual([c - DAY, c + 9])
  })
})

describe('failure', () => {
  it('stops that kind, resumes from the server cursor and backs off', async () => {
    signIn(); enroll()
    tunnel.trips = rows(450)
    let n = 0
    handler = (url, init) => (url === HIST && String(init.body).includes('"trips"') && ++n === 2 ? down() : defaultHandler(url))
    const { hs } = await load()
    await hs.syncHistory()
    expect(posts().filter((p) => p.trips)).toHaveLength(2) // third batch never tried
    expect(hs.historySync.value.state).toBe('error')
    expect(hs.historySync.value.pushed?.trips).toBe(200)
    expect(hs.backoffMs()).toBe(5 * 60_000)
  })
  it('backoff doubles up to 60 minutes', async () => {
    const { hs } = await load()
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => hs.backoffMs(n))).toEqual(
      [0, 5, 10, 20, 40, 60, 60].map((m) => m * 60_000))
  })
  it('timer trigger skips while backing off, then retries', async () => {
    signIn(); enroll()
    handler = () => down()
    stubDoc()
    const { hs } = await load()
    hs.startHistorySync()
    await vi.advanceTimersByTimeAsync(0)
    const first = calls.length
    expect(first).toBe(1) // cursor read failed
    expect(hs.historySync.value.state).toBe('error')
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(calls.length).toBe(first)
    await vi.advanceTimersByTimeAsync(61_000)
    expect(calls.length).toBe(first + 1)
    hs.stopHistorySync()
  })
})

describe('visibility trigger', () => {
  it('syncs when the app turns visible, and not while it is hidden', async () => {
    signIn(); enroll()
    stubDoc('hidden')
    const { hs } = await load()
    hs.startHistorySync()
    await vi.advanceTimersByTimeAsync(0)
    const before = calls.length
    await vi.advanceTimersByTimeAsync(31 * 60_000)
    expect(calls.length).toBe(before) // timer fired while hidden: skipped
    ;(document as unknown as { visibilityState: string }).visibilityState = 'visible'
    docListeners.visibilitychange()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.length).toBeGreaterThan(before)
    hs.stopHistorySync()
  })
})

describe('single flight', () => {
  it('concurrent calls share one run', async () => {
    signIn(); enroll()
    tunnel.trips = rows(3)
    const { hs } = await load()
    await Promise.all([hs.syncHistory(), hs.syncHistory(), hs.syncHistory()])
    expect(calls.filter((c) => c.url.endsWith('/cursor'))).toHaveLength(1)
    expect(posts().filter((p) => p.trips)).toHaveLength(1)
  })
})

describe('config', () => {
  it('is pushed only when it changed, hash kept per device', async () => {
    signIn(); enroll()
    const { hs } = await load()
    await hs.syncHistory()
    expect(posts().filter((p) => p.config)).toEqual([{ config: { enabled: true } }])
    expect(localStorage.getItem('odpwa.cloudHistCfg.' + DEV)).toBeTruthy()
    await hs.syncHistory()
    expect(posts().filter((p) => p.config)).toHaveLength(1)
    tunnel.config = { enabled: false }
    await hs.syncHistory()
    expect(posts().filter((p) => p.config)).toHaveLength(2)
  })
})

describe('tunnel failure', () => {
  it('aborts the run and never reads from the cloud', async () => {
    signIn(); enroll()
    handler = (url) => (url.startsWith(CAR) ? down() : defaultHandler(url))
    const { hs } = await load()
    await hs.syncHistory()
    expect(cloudCalls().map((c) => c.url)).toEqual([CLOUD + '/api/cloud/history/cursor'])
    expect(posts()).toEqual([])
    expect(hs.historySync.value.state).toBe('error')
  })
})
