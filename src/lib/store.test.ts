import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockSocket } from './test-socket'

/*
 * The poll and the cloud's live socket together: store.ts over api.ts, against
 * a mocked fetch and a mocked WebSocket. Fresh modules per test.
 */
const CAR = 'https://car.example'
const DEV = 'byd-e1019f3e'
const CLOUD = 'https://cloud.sl6vn.link'
const LIVE = 'wss://cloud.sl6vn.link/live?token=cloud-tok'
const NOW = 1_800_000_000_000
const DAY = 24 * 3600 * 1000

let calls: string[]
let tunnelUp: boolean
let doc: EventTarget & { hidden: boolean; documentElement: { lang: string } }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const CLOUD_STATUS = { success: true, configured: false, verified: false, enabled: false, localRemoteKey: true, source: 'cloud' }
const SNAP = {
  type: 'snapshot',
  at: NOW,
  status: { soc: { percent: 61 }, source: 'cloud', cloud: { online: true, updatedAt: NOW - 4000 } },
  state: { doors: { overall: 1 } },
  summary: { env: { tempC: 27 }, air: { pm25Inside: 8, pm25Outside: 30 } },
}

function respond(url: string): Response | Promise<Response> {
  const path = url.replace(/^https:\/\/[^/]+/, '')
  if (url.startsWith(CAR)) {
    if (!tunnelUp) return Promise.reject(new TypeError('Failed to fetch'))
    if (path === '/status') return json({ soc: { percent: 60 } })
    if (path === '/api/vehicle/cloud-status') return json({ success: true, configured: true, localRemoteKey: false })
    return json({})
  }
  if (path === '/status') return json({ soc: { percent: 59 }, source: 'cloud', cloud: { online: true, updatedAt: NOW } })
  if (path === '/api/vehicle/cloud-status') return json(CLOUD_STATUS)
  return json({ source: 'cloud' })
}

/** Cloud reads made: the requests the live socket exists to save. */
const cloudReads = (path?: string) => calls.filter((u) => u.startsWith(CLOUD) && (!path || u === CLOUD + path))

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
const cloudOnly = () => localStorage.setItem('odpwa.odcloud.cloudOnly', '1')

let store: typeof import('./store') | null = null
async function boot() {
  vi.resetModules()
  const api = await import('./api')
  store = await import('./store')
  store.start()
  await vi.advanceTimersByTimeAsync(0)
  return { api, store }
}
const flush = () => vi.advanceTimersByTimeAsync(0)
const setHidden = async (h: boolean) => {
  doc.hidden = h
  doc.dispatchEvent(new Event('visibilitychange'))
  await flush()
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('odpwa.lang', 'en')
  calls = []
  tunnelUp = true
  MockSocket.all = []
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  doc = Object.assign(new EventTarget(), { hidden: false, documentElement: { lang: '' } })
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('WebSocket', MockSocket)
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url)
    return respond(url)
  })
})
afterEach(() => {
  store?.stop()
  store = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('when the live socket opens', () => {
  it('never while the tunnel serves the app', async () => {
    signIn(); enroll()
    const { store } = await boot()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.dataSource.value).toBe('tunnel')
    expect(MockSocket.all).toHaveLength(0)
    expect(cloudReads()).toEqual([])
  })

  it('at once in "Use cloud only", on the cloud token', async () => {
    signIn(); enroll(); cloudOnly()
    await boot()
    expect(MockSocket.all.map((s) => s.url)).toEqual([LIVE])
  })

  it('when the tunnel is down and the cloud answers instead', async () => {
    signIn(); enroll()
    tunnelUp = false
    const { store } = await boot()
    expect(store.dataSource.value).toBe('cloud')
    expect(MockSocket.open.map((s) => s.url)).toEqual([LIVE])
  })

  it('never without a cloud session for this car', async () => {
    signIn(); cloudOnly()
    tunnelUp = false
    await boot()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(MockSocket.all).toHaveLength(0)
    localStorage.clear()
    signIn(); enroll(); cloudOnly()
    localStorage.setItem('odpwa.odcloud.device', 'another-car')
    await boot()
    expect(MockSocket.all).toHaveLength(0)
  })

  it('closes while hidden and opens again when visible', async () => {
    signIn(); enroll(); cloudOnly()
    await boot()
    MockSocket.last!.deliver(SNAP)
    await setHidden(true)
    expect(MockSocket.open).toHaveLength(0)
    await setHidden(false)
    expect(MockSocket.open).toHaveLength(1)
    expect(MockSocket.all).toHaveLength(2)
  })

  it('closes on sign-out', async () => {
    signIn(); enroll(); cloudOnly()
    const { api, store } = await boot()
    MockSocket.last!.deliver(SNAP)
    store.reset()
    api.clearAll()
    expect(MockSocket.open).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(MockSocket.all).toHaveLength(1)
  })

  it('closes when the tunnel comes back', async () => {
    signIn(); enroll()
    tunnelUp = false
    const { store } = await boot()
    MockSocket.last!.deliver(SNAP)
    tunnelUp = true
    calls = []
    await vi.advanceTimersByTimeAsync(31_000) // past the breaker: the tunnel is asked again
    expect(calls[0]).toBe(`${CAR}/status`)
    expect(store.dataSource.value).toBe('tunnel')
    expect(MockSocket.open).toHaveLength(0)
    expect(cloudReads().filter((u) => !u.endsWith('/cloud-status'))).toEqual([])
  })
})

describe('snapshots', () => {
  it('fill the same signals the poll does, and the cloud is not polled at all', async () => {
    signIn(); enroll(); cloudOnly()
    const { store } = await boot()
    expect(cloudReads()).toEqual([]) // the socket is coming up: no poll meanwhile
    MockSocket.last!.deliver(SNAP)
    expect(store.status.value?.soc).toEqual({ percent: 61 })
    expect(store.vehicleState.value?.doors?.overall).toBe(1)
    expect(store.outsideTempC.value).toBe(27)
    expect(store.pm25Outside.value).toBe(30)
    expect(store.dataSource.value).toBe('cloud')
    expect(store.connected.value).toBe(true)
    expect(store.lastError.value).toBeNull()

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    // Only the cloud's cloud-status, once; no /status, state or summary polling.
    expect(cloudReads()).toEqual([`${CLOUD}/api/vehicle/cloud-status`])
    expect(calls.filter((u) => u.startsWith(CAR))).toEqual([])

    MockSocket.last!.push({ ...SNAP, status: { ...SNAP.status, soc: { percent: 62 } } })
    expect(store.status.value?.soc).toEqual({ percent: 62 })
  })

  it('while live off the tunnel, only the tunnel is probed — on the breaker’s schedule', async () => {
    signIn(); enroll()
    tunnelUp = false
    await boot()
    MockSocket.last!.deliver(SNAP)
    calls = []
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(cloudReads().filter((u) => !u.endsWith('/cloud-status'))).toEqual([])
    const probes = calls.filter((u) => u === `${CAR}/status`).length
    expect(probes).toBeGreaterThan(0)
    expect(probes).toBeLessThanOrEqual(10) // ~ every 30 s, not every 5 s
  })

  it('nodata reads as the car being offline', async () => {
    signIn(); enroll(); cloudOnly()
    const { store } = await boot()
    MockSocket.last!.deliver({ type: 'nodata', status: { status: 'no_data', source: 'cloud', cloud: {} } })
    expect(store.connected.value).toBe(false)
    expect(store.lastError.value).toBe('The car is not connected to SL6VN Cloud')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(cloudReads().filter((u) => u.endsWith('/status'))).toEqual([])
  })
})

describe('4001', () => {
  it('drops the cloud session like a cloud 401, ends cloud-only, and goes back to the tunnel', async () => {
    signIn(); enroll(); cloudOnly()
    const { api, store } = await boot()
    MockSocket.last!.deliver(SNAP)
    MockSocket.last!.drop(4001)
    expect(localStorage.getItem('odpwa.odcloud.token')).toBeNull()
    expect(api.cloudState.value).toBe('lost')
    expect(api.cloudOnly.value).toBe(false)
    await flush()
    expect(calls).toContain(`${CAR}/status`)
    expect(store.dataSource.value).toBe('tunnel')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(MockSocket.all).toHaveLength(1)
  })

  it('leaves a token renewed since the socket opened alone, and reconnects on it', async () => {
    signIn(); enroll(); cloudOnly()
    await boot()
    localStorage.setItem('odpwa.odcloud.token', 'new-tok')
    MockSocket.last!.drop(4001)
    expect(localStorage.getItem('odpwa.odcloud.token')).toBe('new-tok')
    expect(MockSocket.last!.url).toBe(`${CLOUD.replace('https', 'wss')}/live?token=new-tok`)
  })
})

describe('without the live socket', () => {
  it('polls the cloud every 15 s, not every 5 s', async () => {
    signIn(); enroll(); cloudOnly()
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('blocked') } })
    await boot()
    calls = []
    await vi.advanceTimersByTimeAsync(60_000)
    const polls = cloudReads('/status').length
    expect(polls).toBeGreaterThanOrEqual(4)
    expect(polls).toBeLessThanOrEqual(5)
  })

  it('reconnects with backoff and stops polling once it delivers', async () => {
    signIn(); enroll(); cloudOnly()
    await boot()
    MockSocket.last!.drop(1006)
    await vi.advanceTimersByTimeAsync(1_999)
    expect(MockSocket.all).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(MockSocket.all).toHaveLength(2)
    MockSocket.last!.deliver(SNAP)
    calls = []
    await vi.advanceTimersByTimeAsync(60_000)
    expect(cloudReads('/status')).toEqual([])
  })

  it('reconnects at once when the phone comes back online', async () => {
    signIn(); enroll(); cloudOnly()
    await boot()
    MockSocket.last!.drop(1006)
    await vi.advanceTimersByTimeAsync(2_000)
    MockSocket.last!.drop(1006) // now 5 s away
    window.dispatchEvent(new Event('online'))
    expect(MockSocket.all).toHaveLength(3)
  })
})

describe('cloud-status on the cloud', () => {
  it('is fetched once per cloud session, shown, and never persisted over the car’s answer', async () => {
    signIn(); enroll(); cloudOnly()
    localStorage.setItem('odpwa.cloud', '1')
    localStorage.setItem('odpwa.localkey', '0')
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('blocked') } })
    const { api, store } = await boot()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(cloudReads('/api/vehicle/cloud-status')).toHaveLength(1)
    expect(store.localRemoteKey.value).toBe(true)
    expect(store.cloudConfigured.value).toBe(false)
    expect(localStorage.getItem('odpwa.cloud')).toBe('1')
    expect(localStorage.getItem('odpwa.localkey')).toBe('0')

    // Back on the tunnel: the car's answer again.
    api.setCloudOnly(false)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(store.dataSource.value).toBe('tunnel')
    expect(store.cloudConfigured.value).toBe(true)
    expect(store.localRemoteKey.value).toBe(false)

    // On the cloud again: the answer it already has, no new request.
    calls = []
    api.setCloudOnly(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(cloudReads('/api/vehicle/cloud-status')).toEqual([])
    expect(store.localRemoteKey.value).toBe(true)
  })
})
