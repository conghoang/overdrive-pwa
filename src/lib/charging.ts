import type { StatusResponse } from './types'

export type Phase = 'charging' | 'full' | 'fault' | 'plugged'

/** Exposed so the dashboard can place this card by phase without re-deriving it. */
export function chargingPhase(s: StatusResponse): Phase | null {
  const c = s.charging
  if (!c) return null
  if (c.fault) return 'fault'
  if (c.charging) return 'charging'
  if (c.full) return 'full'
  if (c.plugged) return 'plugged'
  return null
}
