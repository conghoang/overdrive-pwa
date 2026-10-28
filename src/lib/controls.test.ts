import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ControlResult } from './types'

/*
 * The climate wake-resend, and the toast a command leaves behind. A real
 * import of the Controls screen: the resend lives beside the buttons it serves.
 */
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('odpwa.lang', 'en')
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers() })

describe('climate wake-resend', () => {
  it('re-sends a tunnel command once, so a sleeping car still acts', async () => {
    const { runClimate } = await import('../screens/Controls')
    const fn = vi.fn(async (): Promise<ControlResult> => ({ success: true }))
    expect(await runClimate(fn, 'ok')).toBe(true)
    await vi.advanceTimersByTimeAsync(600)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('never re-sends what SL6VN Cloud relayed — it would queue a duplicate', async () => {
    const { runClimate } = await import('../screens/Controls')
    const fn = vi.fn(async (): Promise<ControlResult> => ({ success: true, source: 'cloud', confirmed: null }))
    expect(await runClimate(fn, 'ok')).toBe(true)
    await vi.advanceTimersByTimeAsync(600)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('toastResult', () => {
  it('shows the localised message for a cloud reply, the car’s own otherwise', async () => {
    const { toastResult, toasts } = await import('./toast')
    toastResult({ success: true, source: 'cloud', message: 'Command queued for the car' }, 'Lock')
    expect(toasts.value.at(-1)?.msg).toBe('Lock')
    toastResult({ success: true, message: '2/4' }, 'Vent')
    expect(toasts.value.at(-1)?.msg).toBe('2/4')
  })
})
