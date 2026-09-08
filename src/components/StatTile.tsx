import type { JSX } from 'preact'

interface Props {
  icon: JSX.Element
  label: string
  value: string
  unit?: string
  accent?: string
}

export function StatTile({ icon, label, value, unit, accent }: Props) {
  return (
    <div class="tile">
      <div class="tile-icon" style={accent ? { color: accent } : undefined}>{icon}</div>
      <div class="tile-value mono">
        {value}
        {unit && <span class="tile-unit"> {unit}</span>}
      </div>
      <div class="tile-label">{label}</div>
    </div>
  )
}
