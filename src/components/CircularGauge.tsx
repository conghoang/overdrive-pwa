import type { JSX } from 'preact'

export function CircularGauge({
  percent,
  color,
  label,
  icon,
  sub,
}: {
  percent: number | undefined
  color: string
  /** Not rendered as text any more, but still the gauge's accessible name. */
  label: string
  /** Shown in place of the text caption, tinted to `color`. */
  icon: JSX.Element
  /**
   * Optional third line inside the ring — the range this energy source is
   * worth. Split so only the digits are monospaced, as the total range line
   * below the gauges already does; running the unit through the mono face too
   * opens a visible gap between number and unit.
   */
  sub?: { value: string; unit: string }
}) {
  const size = 132
  const stroke = 13
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const dash = (pct / 100) * circ

  /*
   * Everything lives inside the ring: icon beside the percentage, range under
   * it. Two lines, and the icon costs no vertical space at all because it
   * shares the first one.
   *
   * The pairing is what makes it readable — the icon says which energy, the
   * number says how much of it, and they sit together instead of the name
   * being parked below the ring away from the figure it describes.
   */
  return (
    <div class="gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track-deep)" stroke-width={stroke} />
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
        <div class="gauge-val-row">
          {/*
            role="img" + aria-label keeps the name now that the word is gone.
            Without it this is a gauge identified only by shape and colour —
            the defect just cleared out of the fan bar and the seat segments.
            title gives sighted users the same on hover.
          */}
          <span class="gauge-ico" role="img" aria-label={label} title={label} style={{ color }}>
            {icon}
          </span>
          <div class="gauge-val mono">
            {percent == null ? '--' : Math.round(pct)}
            <small>%</small>
          </div>
        </div>
        {sub && (
          <div class="gauge-sub">
            <span class="mono">{sub.value}</span> {sub.unit}
          </div>
        )}
      </div>
    </div>
  )
}
