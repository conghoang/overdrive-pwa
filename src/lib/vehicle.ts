import type { StatusResponse } from './types'

/**
 * The gear to show, rather than the gear /status reports.
 *
 * OverDrive's `recordingStatus.gear` comes from RecordingModeManager, whose
 * `currentGear` only ever updates when the shift monitor observes a change —
 * it is never reset when the ignition goes off, so it can sit on a driving
 * gear indefinitely on a parked car. OD's own MQTT path forces P in that case
 * (`if (!accOnGear) payload.put("gear", GEAR_P)`); /status simply omits the
 * check, so the correction has to happen here.
 *
 * Tested against `=== false`, not falsy: a build that never sends `acc` leaves
 * it undefined, and inventing a gear from missing data would be worse than
 * showing what the car said.
 *
 * Shared because it was applied in one place and not the other, which put a
 * stale "D" in the hero strip and a correct "P" in the vitals row thirty
 * pixels below it — on the same screen, at the same time.
 */
export function effectiveGear(s: StatusResponse | null | undefined): string | undefined {
  if (!s) return undefined
  return s.acc === false ? 'P' : s.recordingStatus?.gear
}
