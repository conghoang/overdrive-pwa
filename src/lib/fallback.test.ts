import { describe, expect, it } from 'vitest'
import {
  BREAKER_MS, REFRESH_AHEAD_MS, breakerOpen, closeBreaker, cloudSupports, isTunnelFailure, needsRefresh, newBreaker,
  parseCloudSession, route, sessionUsable, tripBreaker,
} from './fallback'

const resp = (status: number, contentType = 'application/json') => ({ kind: 'response' as const, status, contentType })

describe('cloudSupports', () => {
  it('serves the mirrored reads, query strings ignored', () => {
    for (const p of ['/status', '/api/vehicle/state', '/api/launcher/v1/summary', '/api/vehicle/cloud-status', '/status?x=1']) {
      expect(cloudSupports('GET', p)).toBe(true)
    }
  })
  it('relays only the vehicle commands it knows', () => {
    for (const a of ['lock', 'unlock', 'power-on', 'power-off', 'flash', 'find-car', 'climate', 'seat']) {
      expect(cloudSupports('POST', `/api/vehicle/${a}`)).toBe(true)
    }
    for (const a of ['trunk', 'window']) expect(cloudSupports('POST', `/api/vehicle/${a}`)).toBe(false)
  })
  it('never takes trips, charging, camera, keymap or settings', () => {
    expect(cloudSupports('GET', '/api/trips?days=7&limit=200')).toBe(false)
    expect(cloudSupports('GET', '/api/trips/config')).toBe(false)
    expect(cloudSupports('GET', '/api/charging/overview?days=7')).toBe(false)
    expect(cloudSupports('GET', '/api/stream/quality')).toBe(false)
    expect(cloudSupports('POST', '/api/stream/enable')).toBe(false)
    expect(cloudSupports('POST', '/api/keymap/fire')).toBe(false)
    expect(cloudSupports('GET', '/api/settings/unified')).toBe(false)
    // Right path, wrong method.
    expect(cloudSupports('GET', '/api/vehicle/lock')).toBe(false)
    expect(cloudSupports('POST', '/status')).toBe(false)
  })
})

describe('isTunnelFailure', () => {
  it('a network error is always the tunnel', () => {
    expect(isTunnelFailure('GET', { kind: 'network' })).toBe(true)
    expect(isTunnelFailure('POST', { kind: 'network' })).toBe(true)
  })
  it('a timeout counts for reads but never for commands (they may have run)', () => {
    expect(isTunnelFailure('GET', { kind: 'timeout' })).toBe(true)
    expect(isTunnelFailure('POST', { kind: 'timeout' })).toBe(false)
  })
  it('gateway statuses fail a read whatever the body', () => {
    for (const s of [502, 503, 504, 530]) expect(isTunnelFailure('GET', resp(s))).toBe(true)
  })
  it('a command only fails over on a proxy page, not on OverDrive JSON', () => {
    expect(isTunnelFailure('POST', resp(502))).toBe(false)
    expect(isTunnelFailure('POST', resp(503))).toBe(false)
    expect(isTunnelFailure('POST', resp(502, 'text/html; charset=utf-8'))).toBe(true)
    expect(isTunnelFailure('POST', resp(530, 'text/plain'))).toBe(true)
  })
  it('an HTML error page is the tunnel talking (zrok share gone)', () => {
    expect(isTunnelFailure('GET', resp(404, 'text/html'))).toBe(true)
    expect(isTunnelFailure('POST', resp(404, 'text/html'))).toBe(true)
  })
  it('the car answering is not a tunnel failure', () => {
    expect(isTunnelFailure('GET', resp(200))).toBe(false)
    expect(isTunnelFailure('GET', resp(401))).toBe(false)
    expect(isTunnelFailure('GET', resp(404))).toBe(false)
    expect(isTunnelFailure('POST', resp(403))).toBe(false)
    expect(isTunnelFailure('POST', resp(500))).toBe(false)
  })
})

describe('breaker', () => {
  it('opens for BREAKER_MS after a failure, then lets a probe through', () => {
    const b = newBreaker()
    expect(breakerOpen(b, 1000)).toBe(false)
    tripBreaker(b, 1000)
    expect(breakerOpen(b, 1000)).toBe(true)
    expect(breakerOpen(b, 1000 + BREAKER_MS - 1)).toBe(true)
    expect(breakerOpen(b, 1000 + BREAKER_MS)).toBe(false)
  })
  it('closes on success', () => {
    const b = newBreaker()
    tripBreaker(b, 1000)
    closeBreaker(b)
    expect(breakerOpen(b, 1001)).toBe(false)
  })
})

describe('route', () => {
  it('without a cloud, everything goes to the tunnel', () => {
    expect(route({ cloudReady: false, supported: true, open: true })).toBe('tunnel')
  })
  it('unsupported requests never leave the tunnel', () => {
    expect(route({ cloudReady: true, supported: false, open: true })).toBe('tunnel')
  })
  it('tunnel first, cloud second — or cloud straight away while the breaker is open', () => {
    expect(route({ cloudReady: true, supported: true, open: false })).toBe('both')
    expect(route({ cloudReady: true, supported: true, open: true })).toBe('cloud')
  })
})

describe('cloud session', () => {
  const now = 1_700_000_000_000
  it('is usable until it expires; no expiry is taken on trust', () => {
    expect(sessionUsable(null, now)).toBe(false)
    expect(sessionUsable({ token: 'x', expiresAt: now + 1 }, now)).toBe(true)
    expect(sessionUsable({ token: 'x', expiresAt: now }, now)).toBe(false)
    expect(sessionUsable({ token: 'x', expiresAt: 0 }, now)).toBe(true)
  })
  it('needs a refresh when missing or within three days of expiry', () => {
    expect(needsRefresh(null, now)).toBe(true)
    expect(needsRefresh({ token: 'x', expiresAt: now + REFRESH_AHEAD_MS - 1 }, now)).toBe(true)
    expect(needsRefresh({ token: 'x', expiresAt: now + REFRESH_AHEAD_MS + 1 }, now)).toBe(false)
    expect(needsRefresh({ token: 'x', expiresAt: 0 }, now)).toBe(false)
  })
  it('parses success and failure replies', () => {
    expect(parseCloudSession({ success: true, cloudToken: 'tok', expiresAt: now, deviceId: 'byd-1', steps: [] }, 200))
      .toEqual({ ok: true, session: { token: 'tok', expiresAt: now }, deviceId: 'byd-1' })
    expect(parseCloudSession({ success: false, error: 'Car did not connect', step: 'wait' }, 200))
      .toEqual({ ok: false, error: 'Car did not connect', step: 'wait' })
    // success without a token is not a session
    expect(parseCloudSession({ success: true }, 200)).toEqual({ ok: false, error: 'HTTP 200', step: undefined })
    expect(parseCloudSession(null, 502)).toEqual({ ok: false, error: 'HTTP 502', step: undefined })
  })
})
