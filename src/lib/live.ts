/*
 * SL6VN Cloud live socket.
 *
 * While the cloud stands in for the tunnel, polling it costs the cloud's free
 * plan three or four requests every few seconds per open phone. The cloud can
 * instead push the car's reports down ONE websocket as they arrive, so this
 * keeps that socket up — the store decides when it is wanted (see store.ts) and
 * stops polling the cloud while it delivers.
 *
 * Contract (server → client, text JSON):
 *   {type:'snapshot', at, status, state, summary} — on connect, and on every
 *       car report or connect/disconnect (the online flag is in status.cloud)
 *   {type:'nodata', status} — the car has never reported
 * Client → server: "ping" now and then; the cloud answers "pong" by itself.
 * Close codes: 4001 = token turned away (a cloud 401), 4429 = too many
 * connections (back off a minute), anything else = reconnect with backoff.
 *
 * Free of signals and of the store, so it can be tested with a mock socket.
 */
import type { LauncherSummary, StatusResponse, VehicleState } from './types'

export type LiveMessage =
  | { type: 'snapshot'; at?: number; status: StatusResponse; state?: VehicleState | null; summary?: LauncherSummary | null }
  | { type: 'nodata'; status?: StatusResponse }

/** 'connecting' until the first message, 'live' once the cloud is delivering. */
export type LiveState = 'off' | 'connecting' | 'live'

export interface LiveHooks {
  onMessage(m: LiveMessage): void
  /** 4001: the cloud turned this URL's token away. The link stays down until wanted again. */
  onRejected(url: string): void
}

export const LIVE_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000]
export const LIVE_BUSY_MS = 60_000 // 4429
/* Mobile networks drop a socket that has been idle for a while; a ping keeps it warm. */
export const LIVE_PING_MS = 60_000
/* No pong (or anything else) this long after a ping: the socket is dead without knowing it. */
export const LIVE_PONG_WAIT_MS = 15_000
/* A socket that neither opens nor says anything this long is not going to. */
export const LIVE_CONNECT_MS = 10_000

export const CLOSE_REJECTED = 4001
export const CLOSE_BUSY = 4429

function parse(data: unknown): LiveMessage | null {
  if (typeof data !== 'string') return null
  try {
    const m = JSON.parse(data) as { type?: unknown; status?: unknown }
    if (m?.type === 'snapshot' && m.status && typeof m.status === 'object') return m as LiveMessage
    if (m?.type === 'nodata') return m as LiveMessage
  } catch { /* not ours */ }
  return null
}

export class LiveLink {
  private url: string | null = null // what the store wants open; null = closed
  private ws: WebSocket | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private busyUntil = 0 // a 4429 is honoured even across close/reopen
  private _state: LiveState = 'off'

  constructor(private hooks: LiveHooks) {}

  get state(): LiveState { return this._state }

  /**
   * Keep a socket to `url` open, or none (null). Asking again for the same URL
   * changes nothing; a different one (a renewed token) reconnects.
   */
  want(url: string | null): void {
    if (url === this.url) return
    this.url = url
    this.teardown()
    this.clearRetry()
    this.attempt = 0
    if (url) this.connectSoon(0)
  }

  /** Back in view or back online: skip the rest of the backoff. */
  kick(): void {
    if (!this.url || this.ws) return
    this.clearRetry()
    this.attempt = 0
    this.connectSoon(0)
  }

  private connectSoon(ms: number): void {
    const wait = Math.max(ms, this.busyUntil - Date.now())
    if (wait <= 0) return this.connect()
    this.retry = setTimeout(() => {
      this.retry = null
      this.connect()
    }, wait)
  }

  private connect(): void {
    const url = this.url
    if (!url) return
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      return this.lost(null)
    }
    this.ws = ws
    this._state = 'connecting'
    this.connectTimer = setTimeout(() => this.lost(null), LIVE_CONNECT_MS)
    ws.onopen = () => {
      if (ws !== this.ws) return
      this.pingTimer = setInterval(() => this.ping(), LIVE_PING_MS)
    }
    ws.onmessage = (e: MessageEvent) => {
      if (ws !== this.ws) return
      this.clearPong() // anything at all proves the socket alive
      const m = parse(e.data)
      if (!m) return // "pong", or a result for someone else
      if (this._state !== 'live') {
        this._state = 'live'
        this.attempt = 0
        if (this.connectTimer !== null) clearTimeout(this.connectTimer)
        this.connectTimer = null
      }
      this.hooks.onMessage(m)
    }
    ws.onclose = (e: CloseEvent) => {
      if (ws === this.ws) this.lost(e.code)
    }
    ws.onerror = () => { /* a close follows */ }
  }

  private ping(): void {
    const ws = this.ws
    if (!ws || ws.readyState !== 1) return
    try {
      ws.send('ping')
    } catch {
      return this.lost(null)
    }
    if (this.pongTimer === null) this.pongTimer = setTimeout(() => this.lost(null), LIVE_PONG_WAIT_MS)
  }

  /** The socket is gone (code null: we gave up on it). Reconnect, unless told not to. */
  private lost(code: number | null): void {
    this.teardown()
    const url = this.url
    if (!url) return
    if (code === CLOSE_REJECTED) {
      this.url = null
      this.hooks.onRejected(url)
      return
    }
    if (code === CLOSE_BUSY) this.busyUntil = Date.now() + LIVE_BUSY_MS
    const delay = LIVE_BACKOFF_MS[Math.min(this.attempt, LIVE_BACKOFF_MS.length - 1)]
    this.attempt++
    this.connectSoon(delay)
  }

  private teardown(): void {
    const ws = this.ws
    this.ws = null
    this._state = 'off'
    if (this.connectTimer !== null) clearTimeout(this.connectTimer)
    if (this.pingTimer !== null) clearInterval(this.pingTimer)
    this.connectTimer = null
    this.pingTimer = null
    this.clearPong()
    if (!ws) return
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
    try {
      ws.close(1000)
    } catch { /* already closing */ }
  }

  private clearPong(): void {
    if (this.pongTimer !== null) clearTimeout(this.pongTimer)
    this.pongTimer = null
  }

  private clearRetry(): void {
    if (this.retry !== null) clearTimeout(this.retry)
    this.retry = null
  }
}
