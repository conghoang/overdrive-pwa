/**
 * Per-seat status glyphs, using the same symbols the car's own Seats screen
 * shows: a seat in profile with rising waves for heating, or with a fan for
 * ventilation. A crisp icon reads better than an approximate 3D render — and
 * unlike an illustration, it can't look subtly wrong.
 *
 * Orange = heating, blue = ventilation (BYD's colour language); the chip fills
 * at High and stays outlined at Low.
 */

const HEAT = '#f5822a'
const COOL = '#3d9bf5'

/** Seat seen from the side: backrest, cushion, and a foot. */
function SeatGlyph({ color }: { color: string }) {
  return (
    <>
      <path
        d="M8 5 Q8 3 10 3 L13 3 Q15 3 15 5 L15.5 14 L21 14 Q23 14 23 16 Q23 18 21 18 L13 18 Q11 18 11 16 L10 8 Z"
        fill={color}
      />
      <path d="M12 20 L21 20" stroke={color} stroke-width="1.6" stroke-linecap="round" />
    </>
  )
}

/** Rising heat waves. */
function Waves({ color }: { color: string }) {
  return (
    <g stroke={color} stroke-width="1.5" fill="none" stroke-linecap="round">
      <path d="M17 10 Q19 8 17 6 Q15 4 17 2" />
      <path d="M21 10 Q23 8 21 6 Q19 4 21 2" />
    </g>
  )
}

/** Fan for ventilation. */
function Fan({ color }: { color: string }) {
  return (
    <g fill={color}>
      <circle cx="19" cy="6" r="1.4" />
      <path d="M19 6 Q19 1.5 22.5 2.5 Q21 5 19 6" />
      <path d="M19 6 Q23 8 21 10.5 Q19.5 8.5 19 6" />
      <path d="M19 6 Q15.5 9 14 6.5 Q17 5.5 19 6" />
    </g>
  )
}

function Chip({ mode, level }: { mode: 'heat' | 'cool'; level: number }) {
  const color = mode === 'heat' ? HEAT : COOL
  const on = level > 0
  const full = level >= 2
  return (
    <div
      class={'seat-chip' + (on ? ' on' : '')}
      style={
        on
          ? {
              background: full ? color : `${color}26`,
              borderColor: color,
              boxShadow: full ? `0 0 18px ${color}66` : 'none',
            }
          : undefined
      }
    >
      <svg viewBox="0 0 26 24" width="28" height="26" aria-hidden="true">
        <SeatGlyph color={on ? (full ? '#fff' : color) : '#7b8794'} />
        {mode === 'heat' ? (
          <Waves color={on ? (full ? '#fff' : color) : '#7b8794'} />
        ) : (
          <Fan color={on ? (full ? '#fff' : color) : '#7b8794'} />
        )}
      </svg>
      {/* level pips */}
      <span class="seat-pips">
        <i class={level >= 1 ? 'on' : ''} style={level >= 1 ? { background: full ? '#fff' : color } : undefined} />
        <i class={level >= 2 ? 'on' : ''} style={level >= 2 ? { background: '#fff' } : undefined} />
      </span>
    </div>
  )
}

export function SeatVisual({
  driverHeat,
  driverCool,
  passengerHeat,
  passengerCool,
}: {
  driverHeat: number
  driverCool: number
  passengerHeat: number
  passengerCool: number
}) {
  return (
    <div class="seat-status">
      <div class="seat-status-col">
        <Chip mode="cool" level={driverCool} />
        <Chip mode="heat" level={driverHeat} />
      </div>
      <div class="seat-status-col">
        <Chip mode="cool" level={passengerCool} />
        <Chip mode="heat" level={passengerHeat} />
      </div>
    </div>
  )
}
