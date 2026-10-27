/*
 * OD Cloud fallback — the decisions, kept free of fetch, storage and signals so
 * they can be reasoned about (and tested) on their own. api.ts does the I/O.
 *
 * OD Cloud mirrors a slice of OverDrive's HTTP API from the car's MQTT feed. It
 * is a BACKUP: the tunnel is always tried first, and the cloud only answers
 * when the tunnel cannot. Anything the cloud does not serve never goes there —
 * it would only come back as a 503, and some of it (the 51DK shell, camera) has
 * no business leaving the tunnel at all.
 */

/** POST /api/vehicle/<action> commands the cloud can relay to the car. */
const CLOUD_COMMANDS = new Set(['lock', 'unlock', 'power-on', 'power-off', 'flash', 'find-car', 'climate', 'seat'])
/** GETs the cloud serves from its MQTT snapshot. */
const CLOUD_READS = new Set(['/status', '/api/vehicle/state', '/api/launcher/v1/summary', '/api/vehicle/cloud-status'])

/** Whether OD Cloud can serve this request. Query strings never matter here. */
export function cloudSupports(method: string, path: string): boolean {
  const p = path.split('?')[0]
  if (method === 'GET') return CLOUD_READS.has(p)
  if (method === 'POST' && p.startsWith('/api/vehicle/')) return CLOUD_COMMANDS.has(p.slice('/api/vehicle/'.length))
  return false
}

/** What came back from the tunnel, reduced to what the decision needs. */
export type TunnelOutcome =
  | { kind: 'network' } // fetch threw before any response: DNS, TLS, refused, offline
  | { kind: 'timeout' }
  | { kind: 'response'; status: number; contentType: string }

/*
 * Whether a tunnel outcome means "the tunnel is down", as opposed to "the car
 * answered, and the answer was no".
 *
 * Gateway statuses are the tunnel's own: 502/504 from zrok or cloudflared, 503
 * when the share is gone, 530 for a Cloudflare tunnel with no connector. A
 * proxy's error page is HTML, while every OverDrive API route answers JSON —
 * so an HTML error is the tunnel talking whatever its status.
 *
 * A POST is held to a stricter standard than a GET, because retrying a command
 * on a second path risks running it twice. A timeout is ambiguous — the car
 * may well have acted and only the reply was lost — so it is never retried,
 * and a gateway status only counts when it is not OverDrive's own JSON.
 */
export function isTunnelFailure(method: string, o: TunnelOutcome): boolean {
  if (o.kind === 'network') return true
  if (o.kind === 'timeout') return method === 'GET'
  if (o.status < 400) return false
  const html = o.contentType.includes('text/html')
  const gateway = o.status === 502 || o.status === 503 || o.status === 504 || o.status === 530
  if (method === 'GET') return gateway || html
  return html || (gateway && !o.contentType.includes('application/json'))
}

/*
 * Circuit breaker.
 *
 * Without it every 5 s poll would first wait out the tunnel's timeout before
 * asking the cloud, so a dead tunnel would turn the dashboard into a slideshow.
 * After a failure the tunnel is skipped for BREAKER_MS; the first request after
 * that probes it again, and one success closes the breaker for good.
 */
export const BREAKER_MS = 30_000

export interface Breaker { openUntil: number }

export const newBreaker = (): Breaker => ({ openUntil: 0 })
/** True while the tunnel should be skipped. */
export const breakerOpen = (b: Breaker, now: number): boolean => now < b.openUntil
export function tripBreaker(b: Breaker, now: number): void { b.openUntil = now + BREAKER_MS }
export function closeBreaker(b: Breaker): void { b.openUntil = 0 }

/**
 * Where a request goes first.
 *
 *   'tunnel'  — the tunnel only (no cloud, or the cloud can't serve it)
 *   'both'    — the tunnel, then the cloud if the tunnel is down
 *   'cloud'   — straight to the cloud: the breaker is open
 */
export function route(opts: { cloudReady: boolean; supported: boolean; open: boolean }): 'tunnel' | 'both' | 'cloud' {
  if (!opts.cloudReady || !opts.supported) return 'tunnel'
  return opts.open ? 'cloud' : 'both'
}

/*
 * The cloud session: the token the cloud hands back from enrolment (or from a
 * refresh), and when it lapses.
 */
export interface CloudSession { token: string; expiresAt: number }

/** Renew this long before expiry, so a phone left alone for a while still has a backup. */
export const REFRESH_AHEAD_MS = 3 * 24 * 3600 * 1000

/** A token the cloud should still accept. A missing expiry is taken on trust. */
export function sessionUsable(s: CloudSession | null, now: number): boolean {
  return !!s?.token && (!s.expiresAt || s.expiresAt > now)
}

/** Missing, or expiring within REFRESH_AHEAD_MS. */
export function needsRefresh(s: CloudSession | null, now: number): boolean {
  if (!s?.token) return true
  return !!s.expiresAt && s.expiresAt - now < REFRESH_AHEAD_MS
}

export type ParsedSession =
  | { ok: true; session: CloudSession; deviceId?: string }
  | { ok: false; error: string; step?: string }

/**
 * Read an /enroll or /auth/exchange reply. Both answer
 * {success, cloudToken, expiresAt, deviceId?} or {success:false, error, step?};
 * anything else (an HTML error page, an empty body) is a failure with the HTTP
 * status as its only explanation.
 */
export function parseCloudSession(body: unknown, status: number): ParsedSession {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const token = str(b.cloudToken)
  if (b.success === true && token) {
    const exp = Number(b.expiresAt)
    return { ok: true, session: { token, expiresAt: isFinite(exp) && exp > 0 ? exp : 0 }, deviceId: str(b.deviceId) }
  }
  return { ok: false, error: str(b.error) || `HTTP ${status}`, step: str(b.step) }
}
