import type { VehicleState } from './types'

/**
 * What the trunk button should say and do.
 *
 * Door fields use 1 = closed/locked, 2 = open/unlocked, -1 = unknown, and
 * unknown is the normal case rather than an edge one: the value comes from
 * doorLockStatus[4], which OverDrive only fills from BYD Cloud / OTA. A car
 * without a cloud account reports -1 for every door but the driver's, and the
 * local CAN tailgate signal — BODY_BACK_DOOR_STATUS — is defined in
 * BydFeatureIds but never actually read.
 *
 * So the label only commits when the car has genuinely said. Unknown keeps the
 * neutral "Trunk" and the open command, which is what it has always done —
 * guessing "Close" and sending a close to a shut tailgate would be worse than
 * saying nothing.
 */
export function trunkAction(vs: VehicleState | null | undefined): {
  action: 'open' | 'close'
  labelKey: string
  known: boolean
} {
  const state = vs?.doors?.trunk ?? vs?.trunk?.lockStatus
  if (state === 2) return { action: 'close', labelKey: 'ctrl.trunk_close', known: true }
  if (state === 1) return { action: 'open', labelKey: 'ctrl.trunk_open', known: true }
  return { action: 'open', labelKey: 'ctrl.trunk', known: false }
}
