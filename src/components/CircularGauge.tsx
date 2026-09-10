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
   * Two lines inside the ring, never three.
   *
   * The inner circle is only 106px across, and percentage + name + range
   * crowded it — three stacked lines in a round hole, each one squeezed to fit.
   * The two NUMBERS belong together, because that pairing is the point: 68% is
   * what you have, 75 km is what it gets you. The name is the one part that
   * doesn't have to be in the circle at all, so it becomes a caption beneath
   * it, where it has room to be legible instead of tiny.
   */
  return (
    <div class="gauge">
      <div class="gauge-ring">
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
          <div class="gauge-val mono">
            {percent == null ? '--' : Math.round(pct)}
            <small>%</small>
          </div>
          {sub && (
            <div class="gauge-sub">
              <span class="mono">{sub.value}</span> {sub.unit}
            </div>
          )}
        </div>
      </div>
      {/*
        The caption is an icon, tinted to its own ring so the two read as one
        unit. role="img" + aria-label keeps the name — dropping the visible
        word must not drop the word entirely, or this becomes another control
        identified only by shape and colour. title gives the same on hover.
      */}
      <div class="gauge-cap" role="img" aria-label={label} title={label} style={{ color }}>
        {icon}
      </div>
    </div>
  )
}
