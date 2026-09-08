import { IconBolt } from './icons'

interface Props {
  percent: number | undefined
  charging?: boolean
  subLabel?: string
}

/** Circular SOC gauge. Color shifts by charge level; bolt overlay when charging. */
export function BatteryRing({ percent, charging, subLabel }: Props) {
  const size = 208
  const stroke = 16
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const dash = (pct / 100) * circ

  let color = 'var(--accent-bright)'
  if (charging) color = 'var(--success)'
  else if (pct <= 10) color = 'var(--danger)'
  else if (pct <= 20) color = 'var(--warning)'

  return (
    <div class="ring-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} class="ring">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16283a" stroke-width={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div class="ring-center">
        <div class="ring-value mono">
          {percent == null ? '--' : Math.round(pct)}
          <span class="ring-unit">%</span>
        </div>
        {charging && (
          <div class="ring-charging">
            <IconBolt size={15} /> Charging
          </div>
        )}
        {subLabel && !charging && <div class="ring-sub">{subLabel}</div>}
      </div>
    </div>
  )
}
