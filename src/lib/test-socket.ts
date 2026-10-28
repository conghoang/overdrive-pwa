/*
 * A WebSocket stand-in for the tests (node has none worth using): records what
 * the code under test does with it, and lets a test play the server.
 */
export class MockSocket {
  static all: MockSocket[] = []
  static get last(): MockSocket | undefined { return MockSocket.all[MockSocket.all.length - 1] }
  /** Sockets not closed by the client or the server. */
  static get open(): MockSocket[] { return MockSocket.all.filter((s) => s.readyState < 2) }

  readyState = 0
  sent: string[] = []
  closedWith: number | null = null
  onopen: ((e: unknown) => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null

  constructor(public url: string) {
    MockSocket.all.push(this)
  }

  /** Like the cloud, answer "ping" with "pong" by itself (off for a socket gone silent). */
  autoPong = true

  send(data: string): void {
    this.sent.push(data)
    if (data === 'ping' && this.autoPong) queueMicrotask(() => this.readyState === 1 && this.push('pong'))
  }
  close(code = 1000): void {
    this.closedWith = code
    this.readyState = 3
  }

  // --- the server's side ---
  accept(): void {
    this.readyState = 1
    this.onopen?.({})
  }
  push(msg: unknown): void {
    this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) })
  }
  /** Accept and send the first snapshot in one go. */
  deliver(msg: unknown): void {
    this.accept()
    this.push(msg)
  }
  drop(code: number): void {
    this.readyState = 3
    this.onclose?.({ code })
  }
}
