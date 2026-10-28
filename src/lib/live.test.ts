import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveLink, LIVE_CONNECT_MS, LIVE_PING_MS, LIVE_PONG_WAIT_MS } from './live'
import type { LiveMessage } from './live'
import { MockSocket } from './test-socket'

/* The live socket on its own: a mock WebSocket plays the cloud. */
const URL1 = 'wss://cloud.sl6vn.link/live?token=a'
const URL2 = 'wss://cloud.sl6vn.link/live?token=b'
const SNAP = { type: 'snapshot', at: 1, status: { status: 'ok', source: 'cloud' }, state: {}, summary: {} }

let got: LiveMessage[]
let rejected: string[]
let link: LiveLink

beforeEach(() => {
  vi.useFakeTimers()
  MockSocket.all = []
  vi.stubGlobal('WebSocket', MockSocket)
  got = []
  rejected = []
  link = new LiveLink({ onMessage: (m) => got.push(m), onRejected: (u) => rejected.push(u) })
})
afterEach(() => {
  link.want(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('live link', () => {
  it('connects when wanted and is live once the cloud has said something', () => {
    link.want(URL1)
    expect(MockSocket.all.map((s) => s.url)).toEqual([URL1])
    expect(link.state).toBe('connecting')
    MockSocket.last!.accept()
    expect(link.state).toBe('connecting')
    MockSocket.last!.push(SNAP)
    expect(link.state).toBe('live')
    expect(got).toEqual([SNAP])
  })

  it('takes nodata as an answer, and ignores pong and messages that are not its own', () => {
    link.want(URL1)
    const ws = MockSocket.last!
    ws.accept()
    ws.push('pong')
    ws.push({ type: 'result', id: 'x' })
    ws.push('not json')
    expect(got).toEqual([])
    ws.push({ type: 'nodata', status: { status: 'no_data', source: 'cloud' } })
    expect(got.map((m) => m.type)).toEqual(['nodata'])
    expect(link.state).toBe('live')
  })

  it('wanting the same URL again changes nothing; a new URL reconnects; null closes', () => {
    link.want(URL1)
    link.want(URL1)
    expect(MockSocket.all).toHaveLength(1)
    link.want(URL2)
    expect(MockSocket.all.map((s) => s.closedWith)).toEqual([1000, null])
    expect(MockSocket.last!.url).toBe(URL2)
    link.want(null)
    expect(MockSocket.open).toHaveLength(0)
    expect(link.state).toBe('off')
    vi.advanceTimersByTime(120_000)
    expect(MockSocket.all).toHaveLength(2) // and stays closed
  })

  it('reconnects with backoff: 2 s, 5 s, 15 s, then 30 s', () => {
    link.want(URL1)
    const at: number[] = []
    const t0 = Date.now()
    for (let i = 0; i < 5; i++) {
      MockSocket.last!.drop(1006)
      expect(link.state).toBe('off')
      const n = MockSocket.all.length
      while (MockSocket.all.length === n) vi.advanceTimersByTime(100)
      at.push(Date.now())
    }
    const gaps = at.map((t, i) => Math.round((t - (i ? at[i - 1] : t0)) / 1000))
    expect(gaps).toEqual([2, 5, 15, 30, 30])
  })

  it('a socket that delivered starts the backoff over', () => {
    link.want(URL1)
    MockSocket.last!.drop(1006)
    vi.advanceTimersByTime(2_000)
    MockSocket.last!.drop(1001)
    vi.advanceTimersByTime(5_000)
    MockSocket.last!.deliver(SNAP)
    MockSocket.last!.drop(1000)
    vi.advanceTimersByTime(1_999)
    expect(MockSocket.all).toHaveLength(3)
    vi.advanceTimersByTime(1)
    expect(MockSocket.all).toHaveLength(4)
  })

  it('kick skips what is left of the backoff', () => {
    link.want(URL1)
    MockSocket.last!.drop(1006)
    vi.advanceTimersByTime(2_000)
    MockSocket.last!.drop(1006) // now waiting 5 s
    link.kick()
    expect(MockSocket.all).toHaveLength(3)
    link.kick() // already connecting: no second socket
    expect(MockSocket.all).toHaveLength(3)
  })

  it('4429 waits at least a minute, even through kick or close/reopen', () => {
    link.want(URL1)
    MockSocket.last!.drop(4429)
    link.kick()
    link.want(null)
    link.want(URL1)
    vi.advanceTimersByTime(59_000)
    expect(MockSocket.all).toHaveLength(1)
    vi.advanceTimersByTime(1_000)
    expect(MockSocket.all).toHaveLength(2)
  })

  it('4001 reports the rejected URL and does not reconnect', () => {
    link.want(URL1)
    MockSocket.last!.deliver(SNAP)
    MockSocket.last!.drop(4001)
    expect(rejected).toEqual([URL1])
    vi.advanceTimersByTime(120_000)
    expect(MockSocket.all).toHaveLength(1)
    expect(link.state).toBe('off')
    link.want(URL2) // a renewed token may try again
    expect(MockSocket.all).toHaveLength(2)
  })

  it('pings every minute while open; a ping left unanswered drops the socket', () => {
    link.want(URL1)
    const ws = MockSocket.last!
    ws.autoPong = false
    ws.deliver(SNAP)
    vi.advanceTimersByTime(LIVE_PING_MS)
    expect(ws.sent).toEqual(['ping'])
    ws.push('pong')
    vi.advanceTimersByTime(LIVE_PING_MS)
    expect(ws.sent).toEqual(['ping', 'ping'])
    vi.advanceTimersByTime(LIVE_PONG_WAIT_MS)
    expect(ws.closedWith).toBe(1000)
    expect(link.state).toBe('off')
    vi.advanceTimersByTime(2_000)
    expect(MockSocket.all).toHaveLength(2)
  })

  it('gives up on a socket that never says anything', () => {
    link.want(URL1)
    MockSocket.last!.accept()
    vi.advanceTimersByTime(LIVE_CONNECT_MS)
    expect(MockSocket.all[0].closedWith).toBe(1000)
    expect(link.state).toBe('off')
  })

  it('a socket that cannot even be created is retried like any other', () => {
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('blocked') } })
    link.want(URL1)
    expect(link.state).toBe('off')
    vi.stubGlobal('WebSocket', MockSocket)
    vi.advanceTimersByTime(2_000)
    expect(MockSocket.all).toHaveLength(1)
  })
})
