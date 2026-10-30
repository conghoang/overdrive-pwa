import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * api.ts against a mocked fetch. Each test gets a fresh module, so the circuit
 * breaker (module state) never leaks from one test into the next.
 */
const CAR = 'https://car.example'
const DEV = 'byd-e1019f3e'
const CLOUD = 'https://cloud.sl6vn.link'
const NOW = 1_800_000_000_000
const DAY = 24 * 3600 * 1000

type Call = { url: string; init: RequestInit }
let calls: Call[]
let handler: (url: string, init: RequestInit) => Response | Promise<Response>

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const html = (status: number) => new Response('<html>bad gateway</html>', { status, headers: { 'content-type': 'text/html' } })
const down = () => Promise.reject(new TypeError('Failed to fetch'))
/** A request the tunnel never answers: settles only when its deadline aborts it. */
const hang = (_url: string, init: RequestInit) =>
  new Promise<Response>((_, reject) =>
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
const urls = () => calls.map((c) => c.url)
const auth = (c: Call) => (c.init.headers as Record<string, string> | undefined)?.Authorization

async function load() {
  vi.resetModules()
  return import('./api')
}

function signIn() {
  localStorage.setItem('odpwa.baseUrl', CAR)
  localStorage.setItem('odpwa.jwt', 'tunnel-jwt')
  localStorage.setItem('odpwa.deviceId', DEV)
}
function enroll(expiresAt = NOW + 30 * DAY) {
  localStorage.setItem('odpwa.odcloud.token', 'cloud-tok')
  localStorage.setItem('odpwa.odcloud.exp', String(expiresAt))
  localStorage.setItem('odpwa.odcloud.device', DEV)
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('odpwa.lang', 'en') // so messages can be asserted on
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
    await expect(api.streamEnable()).rejects.toBeInstanceOf(api.ApiError)
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
    expect(urls()).toEqual([`${CAR}/api/vehicle/seat`, `${CAR}/auth/status`, `${CLOUD}/api/vehicle/seat`])
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ action: 'heating', position: 1, level: 2 })
  })

  it('reports a car that is not on the cloud', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({ success: false, offline: true }, 503))
    const err = await api.unlock().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(api.ApiError)
    expect((err as InstanceType<typeof api.ApiError>).status).toBe(503)
    expect((err as Error).message).toBe(offlineMsg())
  })

  it('a cloud /status with no data yet reads as the car being offline, not "HTTP 503"', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({ status: 'no_data' }, 503))
    const err = await api.getStatus().catch((e: unknown) => e)
    expect((err as InstanceType<typeof api.ApiError>).status).toBe(503)
    expect((err as Error).message).toBe(offlineMsg())
  })

  it('a JSON 503 or HTML 404 read from OverDrive itself never goes to the cloud', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? json({ error: 'busy' }, 503) : json({}))
    await expect(api.getStatus()).rejects.toThrow('busy')
    handler = (url) => (url.startsWith(CAR) ? html(404) : json({}))
    await expect(api.getVehicleState()).rejects.toBeInstanceOf(api.ApiError)
    expect(calls.every((c) => c.url.startsWith(CAR))).toBe(true)
  })

  it('a 200 interstitial page is a tunnel failure, not data', async () => {
    signIn(); enroll()
    let api = await load()
    handler = (url) => (url.startsWith(CAR) ? html(200) : json({ status: 'ok', source: 'cloud' }))
    expect((await api.getStatus()).source).toBe('cloud')
    expect(urls()).toEqual([`${CAR}/status`, `${CLOUD}/status`])

    // Without a cloud it is an error rather than an empty "success".
    localStorage.clear(); signIn()
    api = await load()
    await expect(api.getStatus()).rejects.toBeInstanceOf(api.ApiError)
  })
})

/** The English car-offline message, as the user sees it. */
function offlineMsg(): string {
  return 'The car is not connected to SL6VN Cloud'
}

describe('breaker', () => {
  it('one slow read falls back once but does not open the breaker; two in a row do', async () => {
    // The Date-only fake from beforeEach has to go before a wider one installs.
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(NOW)
    signIn(); enroll()
    const api = await load()
    handler = (url, init) => (url.startsWith(CAR) ? hang(url, init) : json({ status: 'ok', source: 'cloud' }))
    let p = api.getStatus()
    await vi.advanceTimersByTimeAsync(5_000)
    expect((await p).source).toBe('cloud')
    expect(urls()).toEqual([`${CAR}/status`, `${CLOUD}/status`])

    calls = []
    p = api.getStatus()
    await vi.advanceTimersByTimeAsync(5_000)
    await p
    expect(urls()).toEqual([`${CAR}/status`, `${CLOUD}/status`]) // still tried the tunnel first

    calls = []
    await api.getStatus()
    expect(urls()).toEqual([`${CLOUD}/status`]) // now open
  })

  it('a command that timed out is never retried on the cloud and does not trip the breaker', async () => {
    // The Date-only fake from beforeEach has to go before a wider one installs.
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(NOW)
    signIn(); enroll()
    const api = await load()
    handler = (url, init) => (url.startsWith(CAR) ? hang(url, init) : json({ success: true }))
    const p = api.lock().catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await p).toBeInstanceOf(api.ApiError)
    expect(urls()).toEqual([`${CAR}/api/vehicle/lock`])

    calls = []
    handler = () => json({ status: 'ok' })
    await api.getStatus()
    expect(urls()).toEqual([`${CAR}/status`])
  })

  it('a command whose tunnel is really down (probe fails) goes to the cloud', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({ success: true, source: 'cloud', confirmed: null }))
    const r = await api.lock()
    expect(r.source).toBe('cloud')
    expect(urls()).toEqual([`${CAR}/api/vehicle/lock`, `${CAR}/auth/status`, `${CLOUD}/api/vehicle/lock`])
  })

  it('a command whose tunnel still answers (probe succeeds) is not retried — it may have run', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) =>
      url === `${CAR}/auth/status` ? json({ deviceId: DEV })
      : url.startsWith(CAR) ? down()
      : json({ success: true })
    await expect(api.lock()).rejects.toThrow(/may have reached the car/)
    expect(urls()).toEqual([`${CAR}/api/vehicle/lock`, `${CAR}/auth/status`])

    // ...and the breaker stayed closed.
    calls = []
    handler = () => json({ status: 'ok' })
    await api.getStatus()
    expect(urls()).toEqual([`${CAR}/status`])
  })

  it('with the breaker open a command goes straight to the cloud', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({ success: true, source: 'cloud' }))
    await api.getStatus() // a refused connection opens it at once
    calls = []
    await api.unlock()
    expect(urls()).toEqual([`${CLOUD}/api/vehicle/unlock`])
  })

  it('a phone that is offline does not blame the tunnel', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({ status: 'ok' }))
    await api.getStatus()
    calls = []
    await api.getStatus()
    expect(urls()[0]).toBe(`${CAR}/status`)
  })

  it('resetBreaker sends the next request back to the tunnel', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url) => (url.startsWith(CAR) ? down() : json({ status: 'ok' }))
    await api.getStatus()
    api.resetBreaker()
    calls = []
    handler = () => json({ status: 'ok' })
    await api.getStatus()
    expect(urls()).toEqual([`${CAR}/status`])
  })
})

describe('dataSource', () => {
  it('follows /status only — a cloud command or a cloud read of the state leaves it alone', async () => {
    signIn(); enroll()
    const api = await load()
    handler = () => json({ status: 'ok' })
    await api.getStatus()
    expect(api.dataSource.value).toBe('tunnel')

    handler = (url) => (url.startsWith(CAR) ? down() : json({ success: true, source: 'cloud' }))
    await api.lock()
    expect(urls().at(-1)).toBe(`${CLOUD}/api/vehicle/lock`)
    await api.getVehicleState()
    expect(urls().at(-1)).toBe(`${CLOUD}/api/vehicle/state`)
    expect(api.dataSource.value).toBe('tunnel')
  })
})

describe('one car per cloud session', () => {
  it('signing in to a different car forgets the cloud session', async () => {
    signIn(); enroll()
    const api = await load()
    expect(api.cloudState.value).toBe('on')
    handler = (url) =>
      url.endsWith('/auth/status') ? json({ deviceId: 'byd-7c2a9d10' })
      : url.endsWith('/auth/token') ? json({ success: true, jwt: 'other-jwt', deviceId: 'byd-7c2a9d10' })
      : json({ success: true, cloudToken: 'should-not-happen' })
    await api.login('https://other-car.example', 'abcd1234')
    expect(api.cloudState.value).toBe('off')
    expect(api.getCloudDeviceId()).toBe('')
    expect(localStorage.getItem('odpwa.odcloud.token')).toBeNull()
    expect(calls.some((c) => c.url.startsWith(CLOUD))).toBe(false)

    // Nothing for the new car goes to the old car's cloud.
    calls = []
    handler = (url) => (url.startsWith('https://other-car.example') ? down() : json({ status: 'ok' }))
    await expect(api.getStatus()).rejects.toBeInstanceOf(api.ApiError)
    expect(calls.some((c) => c.url.startsWith(CLOUD))).toBe(false)
  })

  it('a stored session for another device is never used', async () => {
    signIn(); enroll()
    localStorage.setItem('odpwa.odcloud.device', 'byd-7c2a9d10')
    const api = await load()
    expect(api.cloudState.value).toBe('off')
    handler = (url) => (url.startsWith(CAR) ? down() : json({ status: 'ok' }))
    await expect(api.getStatus()).rejects.toBeInstanceOf(api.ApiError)
    expect(urls()).toEqual([`${CAR}/status`])
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
    handler = () => json({ success: true, deviceId: DEV, cloudToken: 'new-tok', expiresAt: NOW + 30 * DAY, steps: [] })
    await api.enrollCloud()
    expect(calls[0].url).toBe(`${CLOUD}/enroll`)
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=UTF-8')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ tunnelUrl: CAR, token: 'tunnel-jwt' })
    expect(localStorage.getItem('odpwa.odcloud.token')).toBe('new-tok')
    expect(api.getCloudDeviceId()).toBe(DEV)
    expect(api.cloudState.value).toBe('on')
  })

  it('proves the current cloud token when re-enrolling a car it already holds', async () => {
    signIn(); enroll()
    let api = await load()
    handler = () => json({ success: true, deviceId: DEV, cloudToken: 'new-tok', expiresAt: NOW + 30 * DAY })
    await api.enrollCloud()
    expect(auth(calls[0])).toBe('Bearer cloud-tok')

    // No session held: nothing to prove.
    localStorage.clear(); signIn(); calls = []
    api = await load()
    await api.enrollCloud()
    expect(auth(calls[0])).toBeUndefined()
  })

  it('stores the tunnel device id when the cloud does not echo one', async () => {
    signIn()
    const api = await load()
    handler = () => json({ success: true, cloudToken: 'new-tok', expiresAt: NOW + 30 * DAY })
    await api.enrollCloud()
    expect(api.getCloudDeviceId()).toBe(DEV)
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

  it('only takes an https cloud URL (http for localhost), and ignores a stored bad one', async () => {
    signIn()
    const api = await load()
    expect(api.setCloudUrl('http://evil.example')).toBe(false)
    expect(api.getCloudUrl()).toBe(CLOUD)
    expect(api.setCloudUrl('http://localhost:8787')).toBe(true)
    expect(api.getCloudUrl()).toBe('http://localhost:8787')
    expect(api.setCloudUrl('')).toBe(true)
    expect(api.getCloudUrl()).toBe(CLOUD)
    localStorage.setItem('odpwa.odcloud.url', 'http://evil.example')
    expect(api.getCloudUrl()).toBe(CLOUD)
  })

  it('pointing at another cloud forgets the session from the old one', async () => {
    signIn(); enroll()
    const api = await load()
    api.setCloudUrl(CLOUD) // unchanged: kept
    expect(api.cloudState.value).toBe('on')
    api.setCloudUrl('https://my-cloud.example')
    expect(api.cloudState.value).toBe('off')
    expect(localStorage.getItem('odpwa.odcloud.token')).toBeNull()
  })

  it('a cloud 401 on the enrolment check drops the cloud session', async () => {
    signIn(); enroll()
    const api = await load()
    handler = () => json({ error: 'Unauthorized' }, 401)
    await expect(api.getCloudEnrollment()).rejects.toBeInstanceOf(api.ApiError)
    expect(localStorage.getItem('odpwa.odcloud.token')).toBeNull()
    expect(api.cloudState.value).toBe('lost')
    expect(api.getJwt()).toBe('tunnel-jwt')
  })

  it('clearAll removes every cloud key and keeps the phone’s own settings', async () => {
    signIn(); enroll()
    localStorage.setItem('odpwa.odcloud.url', 'https://my-cloud.example')
    localStorage.setItem('odpwa.lang', 'vi')
    const api = await load()
    api.clearAll()
    expect(Object.keys(localStorage).filter((k) => k.startsWith('odpwa.odcloud.'))).toEqual([])
    expect(localStorage.getItem('odpwa.lang')).toBe('vi')
    expect(api.cloudState.value).toBe('off')
  })

  it('disable forgets the session locally', async () => {
    signIn(); enroll()
    const api = await load()
    api.disableCloud()
    expect(api.cloudState.value).toBe('off')
    expect(localStorage.getItem('odpwa.odcloud.token')).toBeNull()
    expect(api.getCloudDeviceId()).toBe('')
  })

  it('remove from car deletes only the cloud MQTT connection and commands automation, through the tunnel', async () => {
    signIn(); enroll()
    localStorage.setItem('odpwa.odcloud.cloudOnly', '1') // even in "cloud only", this goes to the car
    const api = await load()
    handler = (url, init) => {
      if (url === `${CAR}/api/mqtt/connections` && !init.method?.match(/DELETE/)) {
        return json({ connections: [
          { id: 'c1', name: 'renamed', brokerUrl: 'wss://cloud.sl6vn.link:443/mqtt/' + DEV },
          { id: 'c2', name: 'Home Assistant', brokerUrl: 'wss://ha.example:443/mqtt' },
          { id: 'c3', name: 'OD Cloud', brokerUrl: 'wss://old.example:443/mqtt' },
        ] })
      }
      if (url === `${CAR}/api/automations/list`) {
        return json({ a1: { name: 'SL6VN Cloud: Commands' }, a2: { name: 'Lock at night' } })
      }
      return json({ success: true })
    }
    await api.removeCloudFromCar()
    const deletes = calls.filter((c) => c.init.method === 'DELETE').map((c) => c.url)
    expect(deletes).toEqual([
      `${CAR}/api/mqtt/connections/c1`,
      `${CAR}/api/mqtt/connections/c3`,
      `${CAR}/api/automations/automation/a1`,
    ])
    expect(calls.every((c) => c.url.startsWith(CAR) && auth(c) === 'Bearer tunnel-jwt')).toBe(true)
  })

  it('remove from car fails when the car refuses a delete', async () => {
    signIn(); enroll()
    const api = await load()
    handler = (url, init) => {
      if (init.method === 'DELETE') return json({ success: false }, 500)
      if (url.endsWith('/api/mqtt/connections')) return json({ connections: [{ id: 'c1', name: 'SL6VN Cloud', brokerUrl: 'x' }] })
      return json({})
    }
    await expect(api.removeCloudFromCar()).rejects.toThrow('Could not remove the setup from the car')
  })

  it('remove from car fails when the tunnel is down', async () => {
    signIn(); enroll()
    const api = await load()
    handler = down
    await expect(api.removeCloudFromCar()).rejects.toBeInstanceOf(api.ApiError)
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

  it('concurrent refreshes share one request', async () => {
    signIn(); enroll(NOW + DAY)
    const api = await load()
    handler = () => json({ success: true, cloudToken: 'renewed', expiresAt: NOW + 30 * DAY })
    const [a, b] = await Promise.all([api.refreshCloud(), api.refreshCloud()])
    expect([a, b]).toEqual([true, true])
    expect(calls).toHaveLength(1)
  })

  it('renews a lost session in-session, at most every 10 minutes', async () => {
    signIn(); enroll()
    localStorage.removeItem('odpwa.odcloud.token')
    const api = await load()
    handler = () => json({ success: false, error: 'nope' })
    api.maybeRefreshCloud()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 0)) // let the failed exchange settle
    api.maybeRefreshCloud()
    expect(calls).toHaveLength(1) // rate-limited

    vi.setSystemTime(NOW + 10 * 60_000 + 1)
    handler = () => json({ success: true, cloudToken: 'renewed', expiresAt: NOW + 30 * DAY })
    api.maybeRefreshCloud()
    await vi.waitFor(() => expect(api.cloudState.value).toBe('on'))
    expect(calls).toHaveLength(2)
  })

  it('a token that lapses while the app is open flips the state to lost', async () => {
    signIn(); enroll(NOW + 60_000)
    const api = await load()
    expect(api.cloudState.value).toBe('on')
    vi.setSystemTime(NOW + 60_001)
    api.syncCloudState()
    expect(api.cloudState.value).toBe('lost')
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
      url.endsWith('/auth/status') ? json({ deviceId: DEV })
      : url.endsWith('/auth/token') ? json({ success: true, jwt: 'fresh-jwt', deviceId: DEV })
      : json({ success: true, cloudToken: 'renewed', expiresAt: NOW + 30 * DAY })
    await api.login(CAR, 'abcd1234')
    await vi.waitFor(() => expect(localStorage.getItem('odpwa.odcloud.token')).toBe('renewed'))
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ tunnelUrl: CAR, token: 'fresh-jwt' })
  })
})

describe('use cloud only', () => {
  it('sends nothing to the tunnel: reads and commands go to the cloud', async () => {
    signIn(); enroll()
    const api = await load()
    api.setCloudOnly(true)
    handler = () => json({ status: 'ok', success: true, source: 'cloud' })
    await api.getStatus()
    await api.lock()
    expect(urls()).toEqual([`${CLOUD}/status`, `${CLOUD}/api/vehicle/lock`])
    expect(api.dataSource.value).toBe('cloud')
  })

  it('cloud-unsupported requests fail like a dead tunnel, without any request', async () => {
    signIn(); enroll()
    const api = await load()
    api.setCloudOnly(true)
    await expect(api.getTrips(7)).rejects.toBeInstanceOf(api.ApiError)
    expect(urls()).toEqual([])
  })

  it('survives a reload, and switching it off sends the next request to the tunnel again', async () => {
    signIn(); enroll()
    let api = await load()
    api.setCloudOnly(true)
    api = await load()
    expect(api.cloudOnly.value).toBe(true)
    api.setCloudOnly(false)
    handler = () => json({ status: 'ok' })
    await api.getStatus()
    expect(urls()).toEqual([`${CAR}/status`])
    expect(api.dataSource.value).toBe('tunnel')
  })

  it('disabling the cloud backup also turns cloud-only off', async () => {
    signIn(); enroll()
    const api = await load()
    api.setCloudOnly(true)
    api.disableCloud()
    expect(api.cloudOnly.value).toBe(false)
    expect(localStorage.getItem('odpwa.odcloud.cloudOnly')).toBeNull()
  })
})

describe('use cloud only without a usable cloud session', () => {
  it('an expired cloud session turns cloud-only off and the car URL is used again', async () => {
    signIn(); enroll(NOW + 60_000)
    const api = await load()
    api.setCloudOnly(true)
    vi.setSystemTime(NOW + 120_000) // cloud token lapses in cloud-only mode
    handler = () => json({ status: 'ok' })
    await api.getStatus()
    expect(urls()).toEqual([`${CAR}/status`]) // not stuck: the real tunnel answers
    api.syncCloudState()
    expect(api.cloudState.value).toBe('lost')
    expect(api.cloudOnly.value).toBe(false)
    expect(localStorage.getItem('odpwa.odcloud.cloudOnly')).toBeNull()
  })

  it('a cloud 401 in cloud-only mode turns it off', async () => {
    signIn(); enroll()
    const api = await load()
    api.setCloudOnly(true)
    handler = () => json({ error: 'Unauthorized' }, 401)
    await expect(api.getStatus()).rejects.toBeInstanceOf(api.ApiError)
    expect(api.cloudState.value).toBe('lost')
    expect(api.cloudOnly.value).toBe(false)
    handler = () => json({ status: 'ok' })
    calls = []
    await api.getStatus()
    expect(urls()).toEqual([`${CAR}/status`])
  })
})

describe('cloud-only setting migration', () => {
  it('carries the old "simulate tunnel down" setting over once', async () => {
    signIn(); enroll()
    localStorage.setItem('odpwa.odcloud.simulateDown', '1')
    const api = await load()
    expect(api.cloudOnly.value).toBe(true)
    expect(localStorage.getItem('odpwa.odcloud.simulateDown')).toBeNull()
    expect(localStorage.getItem('odpwa.odcloud.cloudOnly')).toBe('1')
  })
})

describe('trunk and windows on the cloud', () => {
  it('trunk and all-windows commands go to the cloud in cloud-only mode', async () => {
    signIn(); enroll()
    const api = await load()
    api.setCloudOnly(true)
    handler = () => json({ success: true, source: 'cloud' })
    await api.setTrunk('open')
    await api.closeAllWindows()
    expect(urls()).toEqual([`${CLOUD}/api/vehicle/trunk`, `${CLOUD}/api/vehicle/window`])
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ area: 0, command: 2 })
  })

  it('vent is one cloud command (the car\'s own vent), not four window positions', async () => {
    signIn(); enroll()
    const api = await load()
    api.setCloudOnly(true)
    handler = () => json({ success: true, source: 'cloud' })
    await api.ventWindows()
    expect(urls()).toEqual([`${CLOUD}/api/vehicle/window`])
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ action: 'vent' })
  })
})

describe('car setup migration', () => {
  const SETUP = {
    version: 'v2',
    connection: { qos: 1, minIntervalSeconds: 15, changeOnly: true },
    connectionNames: ['SL6VN Cloud', 'OD Cloud'],
    automation: {
      name: 'SL6VN Cloud: Commands',
      triggers: [{ type: 'mqttTrigger', variables: { channel: 'sl6vn_cmd' } }],
      conditions: [],
      actions: [{ type: 'if', variables: { value: 'lock' }, childActions: [{ type: 'lock', variables: {} }] }],
    },
    automationNames: ['SL6VN Cloud: Commands', 'OD Cloud: Commands'],
  }
  const CLOUD = 'https://cloud.sl6vn.link'
  function car(conn: Record<string, unknown>, auto: Record<string, unknown>) {
    return (url: string, init: RequestInit) => {
      if (url === CLOUD + '/car-setup') return json(SETUP)
      if (url === `${CAR}/api/mqtt/connections` && !init.method?.match(/PUT/)) {
        return json({ connections: [
          { id: 'ha', name: 'Home Assistant', brokerUrl: 'tcp://ha:1883', qos: 0, minIntervalSeconds: 5 },
          { id: 'c1', name: 'SL6VN Cloud', brokerUrl: 'wss://cloud.sl6vn.link:443/mqtt/' + DEV, ...conn },
        ] })
      }
      if (url === `${CAR}/api/automations/list`) return json({ a1: auto, a2: { name: 'Lock at night', actions: [] } })
      return json({ success: true })
    }
  }
  const puts = () => calls.filter((c) => c.init.method === 'PUT').map((c) => [c.url, JSON.parse(String(c.init.body))])

  it('patches only the differing fields of the cloud connection, leaves other connections alone', async () => {
    signIn(); enroll()
    const api = await load()
    handler = car({ qos: 0, minIntervalSeconds: 5, changeOnly: true }, { ...SETUP.automation })
    expect(await api.migrateCarSetup()).toEqual(['connection:qos,minIntervalSeconds'])
    expect(puts()).toEqual([[`${CAR}/api/mqtt/connections/c1`, { qos: 1, minIntervalSeconds: 15 }]])
    expect(localStorage.getItem('odpwa.odcloud.setupVersion')).toBe(String(api.CAR_SETUP_MIGRATION))
  })

  it('rewrites the automation only when what it does differs (key order ignored)', async () => {
    signIn(); enroll()
    let api = await load()
    const same = { name: 'SL6VN Cloud: Commands', conditions: [], triggers: [{ variables: { channel: 'sl6vn_cmd' }, type: 'mqttTrigger' }],
      actions: [{ type: 'if', variables: { value: 'lock', comparator: 'eq' }, childActions: [{ variables: {}, type: 'lock' }] }] }
    handler = car({ qos: 1, minIntervalSeconds: 15, changeOnly: true }, same)
    expect(await api.migrateCarSetup()).toEqual([])
    expect(puts()).toEqual([])

    localStorage.removeItem('odpwa.odcloud.setupVersion'); calls = []
    api = await load()
    handler = car({ qos: 1, minIntervalSeconds: 15, changeOnly: true }, { ...same, actions: [] })
    expect(await api.migrateCarSetup()).toEqual(['automation'])
    expect(puts()).toEqual([[`${CAR}/api/automations/automation/a1`, SETUP.automation]])
  })

  it('makes no request at all once this migration is applied; nothing without the cloud or twice per start', async () => {
    signIn(); enroll()
    let api = await load()
    localStorage.setItem('odpwa.odcloud.setupVersion', String(api.CAR_SETUP_MIGRATION))
    handler = car({ qos: 0 }, {})
    expect(await api.migrateCarSetup()).toEqual([])
    expect(calls).toEqual([])

    // An older migration number does run.
    localStorage.setItem('odpwa.odcloud.setupVersion', String(api.CAR_SETUP_MIGRATION - 1)); calls = []
    api = await load()
    handler = car({ qos: 0, minIntervalSeconds: 15, changeOnly: true }, { ...SETUP.automation })
    expect(await api.migrateCarSetup()).toEqual(['connection:qos'])

    localStorage.clear(); signIn(); calls = [] // not enrolled
    api = await load()
    expect(await api.migrateCarSetup()).toEqual([])
    expect(calls).toEqual([])

    enroll(); calls = []
    api = await load()
    handler = car({ qos: 0, minIntervalSeconds: 15, changeOnly: true }, { ...SETUP.automation })
    await api.migrateCarSetup()
    calls = []
    expect(await api.migrateCarSetup()).toEqual([])
    expect(calls).toEqual([])
  })

  it('keeps the version unapplied when the car refuses, so the next start retries', async () => {
    signIn(); enroll()
    const api = await load()
    const base = car({ qos: 0 }, { ...SETUP.automation })
    handler = (url, init) => (init.method === 'PUT' ? json({ success: false }, 500) : base(url, init))
    expect(await api.migrateCarSetup()).toEqual([])
    expect(localStorage.getItem('odpwa.odcloud.setupVersion')).toBeNull()
  })
})
