import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * api.ts against a mocked fetch. Each test gets a fresh module, so the circuit
 * breaker (module state) never leaks from one test into the next.
 */
const CAR = 'https://car.example'
const CLOUD = 'https://od-cloud.conghoang.workers.dev'
const NOW = 1_800_000_000_000
const DAY = 24 * 3600 * 1000

type Call = { url: string; init: RequestInit }
let calls: Call[]
let handler: (url: string, init: RequestInit) => Response | Promise<Response>

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const html = (status: number) => new Response('<html>bad gateway</html>', { status, headers: { 'content-type': 'text/html' } })
const down = () => Promise.reject(new TypeError('Failed to fetch'))
const auth = (c: Call) => (c.init.headers as Record<string, string> | undefined)?.Authorization

async function load() {
  vi.resetModules()
  return import('./api')
}

function signIn() {
  localStorage.setItem('odpwa.baseUrl', CAR)
  localStorage.setItem('odpwa.jwt', 'tunnel-jwt')
  localStorage.setItem('odpwa.deviceId', 'od-dev')
}
function enroll(expiresAt = NOW + 30 * DAY) {
  localStorage.setItem('odpwa.odcloud.token', 'cloud-tok')
  localStorage.setItem('odpwa.odcloud.exp', String(expiresAt))
  localStorage.setItem('odpwa.odcloud.device', 'byd-e1019f3e')
}

beforeEach(() => {
  localStorage.clear()
  calls = []
  handler = () => json({})
  vi.useFakeTimers({ toFake: ['Date'] })
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

describe('without cloud backup', () => {
  it('behaves as before: tunnel only, a dead tunnel is an error', async () => {
    signIn()
    const api = await load()
    handler = down
    await expect(api.getStatus()).rejects.toBeInstanceOf(api.ApiError)
    expect(calls.map((c) => c.url)).toEqual([`${CAR}/status`])
  })
})

describe('fallback', () => {
  it('a tunnel failure retries the read on the cloud with the cloud token', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? html(502) : json({ status: 'ok', source: 'cloud' }))
    const s = await api.getStatus()
    expect(s.source).toBe('cloud')
    expect(calls.map((c) => c.url)).toEqual([`${CAR}/status`, `${CLOUD}/status`])
    expect(auth(calls[1])).toBe('Bearer cloud-tok')
    expect(api.dataSource.value).toBe('cloud')
  })

  it('the breaker skips the tunnel for 30 s, then probes it again', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({ source: 'cloud' }))
    await api.getStatus()
    calls = []
    await api.getVehicleState()
    expect(calls.map((c) => c.url)).toEqual([`${CLOUD}/api/vehicle/state`])

    vi.setSystemTime(NOW + 31_000)
    handler = () => json({ status: 'ok' })
    calls = []
    await api.getStatus()
    expect(calls.map((c) => c.url)).toEqual([`${CAR}/status`])
    expect(api.dataSource.value).toBe('tunnel')
  })

  it('never sends a cloud-unsupported request to the cloud', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({}))
    await expect(api.getTrips(7)).rejects.toBeInstanceOf(api.ApiError)
    await expect(api.fireShell('true')).rejects.toBeInstanceOf(api.ApiError)
    await expect(api.setTrunk('open')).rejects.toBeInstanceOf(api.ApiError)
    expect(calls.every((c) => c.url.startsWith(CAR))).toBe(true)
  })

  it('a command fails over on a dead tunnel, but not on the car’s own error', async () => {
    signIn(); enroll()
    let api = await load()
    handler = (url) => (url.startsWith(CAR) ? json({ success: false, error: 'busy' }, 503) : json({ success: true }))
    await expect(api.lock()).rejects.toThrow('busy')
    expect(calls.map((c) => c.url)).toEqual([`${CAR}/api/vehicle/lock`])

    api = await load()
    calls = []
    handler = (url) => (url.startsWith(CAR) ? down() : json({ success: true, confirmed: true, source: 'cloud' }))
    const r = await api.setSeatHeat(1, 2)
    expect(r.success).toBe(true)
    expect(calls[1].url).toBe(`${CLOUD}/api/vehicle/seat`)
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ action: 'heating', position: 1, level: 2 })
  })

  it('reports a car that is not on the cloud', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({ success: false, offline: true }, 503))
    await expect(api.unlock()).rejects.toThrow(/OD Cloud/)
  })
})

describe('auth', () => {
  it('a cloud 401 drops only the cloud session', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({ error: 'Unauthorized' }, 401))
    const err = await api.getStatus().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(api.ApiError)
    expect(err).not.toBeInstanceOf(api.AuthError)
    expect(api.getJwt()).toBe('tunnel-jwt')
    expect(localStorage.getItem('odpwa.odcloud.token')).toBeNull()
    expect(api.cloudState.value).toBe('lost')

    // With no cloud session left, nothing more goes to the cloud.
    calls = []
    vi.setSystemTime(NOW + 31_000)
    await api.getStatus().catch(() => {})
    expect(calls.map((c) => c.url)).toEqual([`${CAR}/status`])
  })

  it('a tunnel 401 keeps the existing sign-out behaviour and leaves the cloud alone', async () => {
    signIn(); enroll()
    const api = await load()
    handler = () => json({ error: 'Unauthorized' }, 401)
    await expect(api.getStatus()).rejects.toBeInstanceOf(api.AuthError)
    expect(api.getJwt()).toBe('')
    expect(localStorage.getItem('odpwa.odcloud.token')).toBe('cloud-tok')
  })
})

describe('enrolment', () => {
  it('posts the tunnel URL and JWT as text/plain and keeps the cloud session', async () => {
    signIn()
    const api = await load()
    expect(api.cloudState.value).toBe('off')
    handler = () => json({ success: true, deviceId: 'byd-e1019f3e', cloudToken: 'new-tok', expiresAt: NOW + 30 * DAY, steps: [] })
    await api.enrollCloud()
    expect(calls[0].url).toBe(`${CLOUD}/enroll`)
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=UTF-8')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ tunnelUrl: CAR, token: 'tunnel-jwt' })
    expect(localStorage.getItem('odpwa.odcloud.token')).toBe('new-tok')
    expect(api.getCloudDeviceId()).toBe('byd-e1019f3e')
    expect(api.cloudState.value).toBe('on')
  })

  it('surfaces the failing step and stores nothing', async () => {
    signIn()
    const api = await load()
    handler = () => json({ success: false, error: 'Car did not connect', step: 'wait-connect' })
    await expect(api.enrollCloud()).rejects.toThrow('Car did not connect (wait-connect)')
    expect(localStorage.getItem('odpwa.odcloud.token')).toBeNull()
    expect(api.cloudState.value).toBe('off')
  })

  it('uses the advanced URL override', async () => {
    signIn()
    const api = await load()
    api.setCloudUrl('my-cloud.example/some/path')
    handler = () => json({ success: true, cloudToken: 't', expiresAt: NOW + DAY * 30 })
    await api.enrollCloud()
    expect(calls[0].url).toBe('https://my-cloud.example/enroll')
  })

  it('disable forgets the session locally', async () => {
    signIn(); enroll()
    const api = await load()
    api.disableCloud()
    expect(api.cloudState.value).toBe('off')
    expect(localStorage.getItem('odpwa.odcloud.token')).toBeNull()
    expect(api.getCloudDeviceId()).toBe('')
  })
})

describe('refresh', () => {
  it('renews only an enrolled token that is missing or near expiry', async () => {
    signIn()
    let api = await load()
    api.maybeRefreshCloud()
    expect(calls).toHaveLength(0) // never enrolled

    enroll(NOW + 10 * DAY)
    api = await load()
    api.maybeRefreshCloud()
    expect(calls).toHaveLength(0) // plenty of life left

    enroll(NOW + 1 * DAY)
    api = await load()
    handler = () => json({ success: true, cloudToken: 'renewed', expiresAt: NOW + 30 * DAY })
    api.maybeRefreshCloud()
    await vi.waitFor(() => expect(localStorage.getItem('odpwa.odcloud.token')).toBe('renewed'))
    expect(calls[0].url).toBe(`${CLOUD}/auth/exchange`)
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ tunnelUrl: CAR, token: 'tunnel-jwt' })
  })

  it('revives a session the cloud rejected', async () => {
    signIn(); enroll()
    localStorage.removeItem('odpwa.odcloud.token')
    const api = await load()
    expect(api.cloudState.value).toBe('lost')
    handler = () => json({ success: true, cloudToken: 'renewed', expiresAt: NOW + 30 * DAY })
    expect(await api.refreshCloud()).toBe(true)
    expect(api.cloudState.value).toBe('on')
  })

  it('fails silently and keeps the old token', async () => {
    signIn(); enroll(NOW + DAY)
    const api = await load()
    handler = () => json({ success: false, error: 'nope' })
    expect(await api.refreshCloud()).toBe(false)
    expect(localStorage.getItem('odpwa.odcloud.token')).toBe('cloud-tok')
  })

  it('a fresh tunnel login renews the cloud token', async () => {
    enroll()
    const api = await load()
    handler = (url) =>
      url.endsWith('/auth/status') ? json({ deviceId: 'od-dev' })
      : url.endsWith('/auth/token') ? json({ success: true, jwt: 'fresh-jwt', deviceId: 'od-dev' })
      : json({ success: true, cloudToken: 'renewed', expiresAt: NOW + 30 * DAY })
    await api.login(CAR, 'abcd1234')
    await vi.waitFor(() => expect(localStorage.getItem('odpwa.odcloud.token')).toBe('renewed'))
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ tunnelUrl: CAR, token: 'fresh-jwt' })
  })
})
