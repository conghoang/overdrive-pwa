/**
 * Light tactile + audible feedback, like a native app.
 *
 * Each helper fires the haptic AND the (opt-in, default-off) UI sound, so call
 * sites get both from one call and the two can never drift apart.
 *
 * Uses the Vibration API — supported on Android (Chrome/Firefox/Samsung).
 * iOS Safari does NOT implement it, so these are silent no-ops there rather
 * than errors. Vibration is also ignored by the OS when the user has haptics
 * or system vibration switched off, which is the behaviour we want.
 */

import { errorSound, successSound, tapSound } from './sound'

const K = 'odpwa.haptics'

export function hapticsEnabled(): boolean {
  return localStorage.getItem(K) !== '0'
}
export function setHapticsEnabled(on: boolean): void {
  localStorage.setItem(K, on ? '1' : '0')
}

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function buzz(pattern: number | number[]): void {
  if (!hapticsSupported() || !hapticsEnabled()) return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* some browsers throw when the page isn't visible — ignore */
  }
}

/** A tap on any control. */
export const tapFeedback = () => {
  buzz(12)
  tapSound()
}
/** A command actually succeeded. */
export const successFeedback = () => {
  buzz([14, 40, 22])
  successSound()
}
/** A command failed / was rejected. */
export const errorFeedback = () => {
  buzz([32, 60, 32])
  errorSound()
}
/** A press-and-hold reached its commit point. */
export const commitFeedback = () => {
  buzz(28)
  tapSound()
}
