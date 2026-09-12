import type { TyreCorner, TyreLimits } from './types'

/**
 * Tyre corner severity, ported from OverDrive so this app colours a corner with
 * exactly the numbers that drive the car's own notifications.
 *
 *   'alert'  — leak (airLeakState >= 1), or kPa at/below criticalLow
 *   'warn'   — kPa outside the configured band for that axle, or the firmware
 *              pressureState reports UNDER/OVER
 *   'normal' — in-band with no firmware warning
 *   'muted'  — no signal or no data
 *
 * Two details are load-bearing and match OD:
 *
 * 1. Compare in kPa, never PSI or bar. kPa is what the TPMS reports and what
 *    the limits are stored in, so the colour can't disagree with the car's
 *    threshold because of display rounding.
 * 2. The numeric band is evaluated BEFORE the firmware enum, worst wins. A
 *    genuinely flat tyre usually ALSO trips the under-pressure flag, and an
 *    enum-first check would paint the most serious case merely 'warn'.
 */
export type TyreSeverity = 'muted' | 'alert' | 'warn' | 'normal'

/** Mirrors OD's UnifiedConfigManager defaults, used until the car sends its own. */
export const DEFAULT_TYRE_LIMITS = {
  frontLow: 234,
  frontHigh: 310,
  rearLow: 234,
  rearHigh: 310,
  criticalLow: 152,
}

export function tyreLimits(limits: TyreLimits | undefined) {
  return { ...DEFAULT_TYRE_LIMITS, ...(limits || {}) }
}

export function tyreSeverity(
  c: TyreCorner | undefined,
  isFront: boolean,
  lim: TyreLimits | undefined,
): TyreSeverity {
  if (!c || c.available === false) return 'muted'
  if (c.signalState === 1) return 'muted'
  if ((c.airLeakState ?? 0) >= 1) return 'alert'

  const l = tyreLimits(lim)
  const low = isFront ? l.frontLow : l.rearLow
  const high = isFront ? l.frontHigh : l.rearHigh
  if (typeof c.kPa === 'number' && c.kPa > 0) {
    if (c.kPa <= l.criticalLow) return 'alert'
    if (c.kPa < low || c.kPa > high) return 'warn'
  }
  // In band (or no reading): the firmware can still assert a fault we can't
  // see numerically, and it stays authoritative for that.
  if ((c.pressureState ?? 0) >= 1) return 'warn'
  return 'normal'
}

/** Short reason for a non-normal corner, so the colour is explained. */
export function tyreReasonKey(
  c: TyreCorner | undefined,
  isFront: boolean,
  lim: TyreLimits | undefined,
): string | null {
  if (!c || c.available === false) return 'tyre.no_data'
  if (c.signalState === 1) return 'tyre.no_signal'
  if (c.airLeakState === 2) return 'tyre.fast_leak'
  if (c.airLeakState === 1) return 'tyre.slow_leak'
  /*
   * Direction comes from the kPa READING, never from the firmware enum.
   *
   * This used to map pressureState 1 -> low and 2 -> high. That was a guess:
   * OverDrive itself only ever tests `pressureState != 0` and never assigns a
   * direction to the value. On a real car a tyre at 222 kPa — plainly under the
   * 234 limit — came back as 2 and was captioned "over-inflated", contradicting
   * the number printed beside it.
   *
   * The reading is on screen next to the label, so deriving the wording from it
   * cannot contradict what the user can see. The enum still decides THAT
   * something is wrong; it no longer decides which way.
   *
   * Uses the SAME boundary as tyreSeverity: kPa <= criticalLow is 'alert', and
   * criticalLow may equal an axle low, so a strict `< low` here would caption a
   * red corner "OK" at exactly that value.
   */
  const l = tyreLimits(lim)
  const low = isFront ? l.frontLow : l.rearLow
  const high = isFront ? l.frontHigh : l.rearHigh
  const flagged = c.pressureState != null && c.pressureState !== 0
  if (typeof c.kPa === 'number' && c.kPa > 0) {
    if (c.kPa <= low) return 'tyre.low'
    if (c.kPa > high) return 'tyre.high'
    // In band, yet the firmware is unhappy: report the warning without
    // inventing a direction the reading does not support.
    return flagged ? 'tyre.check' : null
  }
  // No usable reading — the enum is all there is, so it can only say "check".
  return flagged ? 'tyre.check' : null
}
