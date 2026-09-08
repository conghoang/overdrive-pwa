export function CircularGauge({
  percent,
  color,
  label,
}: {
  percent: number | undefined
  color: string
  label: string
}) {
  const size = 132
  const stroke = 13
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const dash = (pct / 100) * circ

  return (
    <div class="gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1b2b3d" stroke-width={stroke} />
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
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div class="gauge-center">
        <div class="gauge-val mono">
          {percent == null ? '--' : Math.round(pct)}
          <small>%</small>
        </div>
        <div class="gauge-label">{label}</div>
      </div>
    </div>
  )
}
