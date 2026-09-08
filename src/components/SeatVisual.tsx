/**
 * Seats drawn in the same 3/4 view the car's own Seats screen uses: you look
 * down at the front pair from the right, so both the backrest face and the
 * cushion top — the surfaces that actually heat and ventilate — are visible.
 *
 * The seat body stays neutral; the seating surfaces take the live state colour
 * (BYD's own language: orange = heat, blue = ventilation), dim at Low and full
 * at High.
 */

const HEAT = '#ff8a3d'
const COOL = '#49a6ff'

function stateOf(heat: number, cool: number) {
  const color = heat > 0 ? HEAT : cool > 0 ? COOL : null
  const level = heat > 0 ? heat : cool
  return { color, strong: level >= 2 }
}

// Soft, bulging forms — upholstery, not folded card.
const BACK =
  'M31 32 Q30 20 43 18 L66 14 Q79 13 80 25 L87 80 Q88 92 75 94 L43 100 Q31 101 30 90 Z'
const CUSHION =
  'M36 96 L83 88 Q97 86 100 97 L104 113 Q107 125 94 128 L50 137 Q38 139 36 128 Z'
const HEADREST = 'M38 3 Q37 -3 45 -4 L63 -7 Q71 -8 72 -2 L74 11 Q75 18 67 19 L47 22 Q39 23 38 16 Z'

function Seat({ x, heat, cool, id }: { x: number; heat: number; cool: number; id: string }) {
  const { color, strong } = stateOf(heat, cool)
  const surface = color ?? '#63717f'
  const surfaceOpacity = color ? (strong ? 0.95 : 0.55) : 0.9

  return (
    <g transform={`translate(${x} 0)`}>
      {color && (
        <g filter={`url(#g-${id})`} opacity={strong ? 0.6 : 0.32}>
          <path d={BACK} fill={color} />
          <path d={CUSHION} fill={color} />
        </g>
      )}

      <ellipse cx="70" cy="141" rx="30" ry="5" fill="#000" opacity="0.42" />

      {/* ---- cushion ---- */}
      <path d={CUSHION} fill={`url(#top-${id})`} />
      {/* seating surface — the part that heats / ventilates */}
      <path
        d="M47 101 Q46 96 53 95 L80 91 Q88 90 90 97 L93 110 Q95 117 87 119 L57 125 Q49 126 48 119 Z"
        fill={surface}
        opacity={surfaceOpacity}
      />

      {/* ---- backrest ---- */}
      {/* side face for thickness */}
      <path d="M31 32 Q30 20 43 18 L38 21 Q28 23 29 34 L36 92 Q37 101 45 100 L43 100 Q31 101 30 90 Z" fill={`url(#side-${id})`} />
      <path d={BACK} fill={`url(#face-${id})`} />
      {/* centre panel */}
      <path
        d="M42 36 Q41 30 48 29 L67 26 Q74 25 75 31 L80 76 Q81 83 74 84 L50 88 Q43 89 42 83 Z"
        fill={surface}
        opacity={surfaceOpacity}
      />
      {/* bolster seams */}
      <path d="M42 36 Q39 60 44 87" stroke="rgba(0,0,0,0.20)" stroke-width="1.1" fill="none" />
      <path d="M75 31 Q79 56 80 78" stroke="rgba(0,0,0,0.20)" stroke-width="1.1" fill="none" />
      {/* top highlight */}
      <path d="M35 24 Q52 17 76 20" stroke="rgba(255,255,255,0.22)" stroke-width="1.6" fill="none" stroke-linecap="round" />

      {/* ---- headrest ---- */}
      <path d="M45 20 L47 27 L52 26 L50 19 Z" fill="#2b3947" />
      <path d={HEADREST} fill={`url(#face-${id})`} />
      <path d="M38 3 Q37 -3 45 -4 L42 -1 Q39 1 40 6 L42 17 Q43 21 47 21 L47 22 Q39 23 38 16 Z" fill={`url(#side-${id})`} />
    </g>
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
    <svg viewBox="0 0 240 155" class="seat-visual" aria-hidden="true">
      <defs>
        {['d', 'p'].map((id) => (
          <>
            <linearGradient id={`face-${id}`} x1="0" y1="0" x2="1" y2="0.4">
              <stop offset="0" stop-color="#9fb0c1" />
              <stop offset="1" stop-color="#75879a" />
            </linearGradient>
            <linearGradient id={`top-${id}`} x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stop-color="#a9b9c8" />
              <stop offset="1" stop-color="#7e8fa1" />
            </linearGradient>
            <linearGradient id={`side-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#5c6b7b" />
              <stop offset="1" stop-color="#41505f" />
            </linearGradient>
            <linearGradient id={`edge-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#6d7e90" />
              <stop offset="1" stop-color="#4a5967" />
            </linearGradient>
            <filter id={`g-${id}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
          </>
        ))}
      </defs>
      <Seat x={6} id="d" heat={driverHeat} cool={driverCool} />
      <Seat x={118} id="p" heat={passengerHeat} cool={passengerCool} />
    </svg>
  )
}
