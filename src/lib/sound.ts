/**
 * Optional UI sounds — OFF by default (opt in from Settings).
 *
 * Tones are synthesized with WebAudio, so there are no audio files to ship or
 * download. The AudioContext is created lazily on the first *user gesture*,
 * which is what browser autoplay policies require, and is resumed if the OS
 * suspended it.
 */

const K = 'odpwa.sound'

export function soundEnabled(): boolean {
  return localStorage.getItem(K) === '1' // opt-in: default off
}
export function setSoundEnabled(on: boolean): void {
  localStorage.setItem(K, on ? '1' : '0')
}

export function soundSupported(): boolean {
  return typeof window !== 'undefined' &&
    !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
}

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (!soundSupported()) return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  // iOS/Android suspend the context when backgrounded.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

/** One short tone. Kept quiet and brief so it reads as a UI tick, not a beep. */
function tone(freq: number, ms: number, gain = 0.05, type: OscillatorType = 'sine', delay = 0): void {
  const a = audio()
  if (!a) return
  try {
    const t0 = a.currentTime + delay
    const osc = a.createOscillator()
    const g = a.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    // Fast attack, exponential release — avoids the click a hard stop makes.
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000)
    osc.connect(g).connect(a.destination)
    osc.start(t0)
    osc.stop(t0 + ms / 1000 + 0.02)
  } catch {
    /* ignore — audio is a nicety, never a failure path */
  }
}

export function tapSound(): void {
  if (!soundEnabled()) return
  tone(880, 45, 0.035, 'sine')
}
export function successSound(): void {
  if (!soundEnabled()) return
  tone(784, 70, 0.05) // G5
  tone(1175, 110, 0.045, 'sine', 0.07) // D6 — rising = done
}
export function errorSound(): void {
  if (!soundEnabled()) return
  tone(330, 90, 0.05, 'triangle')
  tone(220, 150, 0.05, 'triangle', 0.09) // falling = rejected
}
