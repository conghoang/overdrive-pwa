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

/**
 * Prime audio from inside a user gesture. Mobile browsers start the context
 * SUSPENDED, and a note scheduled while suspended is simply never heard — so
 * this is called when the user flips the toggle on, which is a real gesture.
 */
export function unlockAudio(): void {
  const a = audio()
  if (!a) return
  try {
    // A silent one-sample buffer is the standard way to open the output.
    const buf = a.createBuffer(1, 1, a.sampleRate)
    const src = a.createBufferSource()
    src.buffer = buf
    src.connect(a.destination)
    src.start(0)
  } catch {
    /* ignore */
  }
}

/** One short tone. Brief enough to read as a UI tick rather than a beep. */
function tone(freq: number, ms: number, gain = 0.12, type: OscillatorType = 'sine', delay = 0): void {
  const a = audio()
  if (!a) return

  const emit = () => {
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

  // Scheduling into a suspended context silently drops the note (the usual
  // "works on desktop, silent on phone" trap), so wait for the resume.
  if (a.state === 'suspended') a.resume().then(emit).catch(() => {})
  else emit()
}

export function tapSound(): void {
  if (!soundEnabled()) return
  tone(880, 50, 0.13, 'sine')
}
export function successSound(): void {
  if (!soundEnabled()) return
  tone(784, 75, 0.16) // G5
  tone(1175, 120, 0.15, 'sine', 0.07) // D6 — rising = done
}
export function errorSound(): void {
  if (!soundEnabled()) return
  tone(330, 95, 0.15, 'triangle')
  tone(220, 160, 0.15, 'triangle', 0.09) // falling = rejected
}
