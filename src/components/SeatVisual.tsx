/**
 * Two front seats seen from behind, rendered rather than drawn flat: sculpted
 * side bolsters, a quilted centre panel with stitching, specular highlights and
 * contact shadow. Each seat lights up with its live climate state — blue for
 * ventilation, warm red for heating, brighter at High.
 */

const COOL = '#4aa8ff'
const HEAT = '#ff6a4a'

function Seat({ x, heat, cool, id }: { x: number; heat: number; cool: number; id: string }) {
  const active = heat > 0 ? HEAT : cool > 0 ? COOL : null
  const level = heat > 0 ? heat : cool
  const glow = active ? (level >= 2 ? 0.9 : 0.55) : 0

  // Backrest silhouette: narrow at the shoulders, flaring to the hips. Kept
  // wide-ish and short — a seat viewed from behind is nothing like a tall slab.
  const back =
    'M22 36 Q22 25 36 24 L64 24 Q78 25 78 36 L83 96 Q84 108 68 109 L32 109 Q16 108 17 96 Z'

  return (
    <g transform={`translate(${x} 0)`}>
      {/* state glow, behind everything */}
      {active && (
        <g filter={`url(#soft-${id})`} opacity={glow}>
          <path d={back} fill={active} />
          <rect x="16" y="104" width="68" height="30" rx="14" fill={active} />
        </g>
      )}

      {/* contact shadow on the cushion */}
      <ellipse cx="50" cy="137" rx="38" ry="6" fill="#000" opacity="0.45" />

      {/* seat base, mostly hidden behind the backrest */}
      <path d="M14 110 Q14 102 24 102 L76 102 Q86 102 86 110 L88 126 Q88 136 76 136 L24 136 Q12 136 12 126 Z" fill={`url(#base-${id})`} />
      <path d="M14 110 Q14 102 24 102 L76 102 Q86 102 86 110" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1" />

      {/* backrest — outer shell (the bolsters) */}
      <path d={back} fill={`url(#shell-${id})`} />
      {/* sculpted inner panel */}
      <path
        d="M31 40 Q31 32 42 32 L58 32 Q69 32 69 40 L73 92 Q73 101 60 101 L40 101 Q27 101 27 92 Z"
        fill={`url(#panel-${id})`}
      />
      {/* quilt stitching down the panel */}
      <g stroke="rgba(0,0,0,0.40)" stroke-width="0.9" stroke-dasharray="3 3" fill="none">
        <path d="M41 36 L38 98" />
        <path d="M59 36 L62 98" />
      </g>
      {/* bolster seams */}
      <g stroke="rgba(0,0,0,0.35)" stroke-width="1" fill="none">
        <path d="M29 38 Q25 68 27 100" />
        <path d="M71 38 Q75 68 73 100" />
      </g>
      {/* specular highlight along the left bolster */}
      <path d="M25 42 Q22 68 24 96" stroke="rgba(255,255,255,0.16)" stroke-width="2.2" fill="none" stroke-linecap="round" />
      {/* rim light picks up the state colour when active */}
      <path
        d={back}
        fill="none"
        stroke={active || 'rgba(190,215,240,0.22)'}
        stroke-width={active ? 1.4 : 1.2}
        opacity={active ? 0.55 : 1}
      />

      {/* headrest posts */}
      <rect x="40" y="18" width="4" height="9" rx="2" fill="#0e1218" />
      <rect x="56" y="18" width="4" height="9" rx="2" fill="#0e1218" />
      {/* headrest */}
      <rect x="29" y="2" width="42" height="19" rx="9" fill={`url(#shell-${id})`} />
      <rect x="29" y="2" width="42" height="19" rx="9" fill="none" stroke="rgba(190,215,240,0.20)" stroke-width="1" />
      <path d="M34 6 Q50 3 66 6" stroke="rgba(255,255,255,0.14)" stroke-width="1.6" fill="none" stroke-linecap="round" />
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
    <svg viewBox="0 0 220 146" class="seat-visual" aria-hidden="true">
      <defs>
        {['d', 'p'].map((id) => (
          <>
            {/* outer shell: rounded, lit from upper-left */}
            <linearGradient id={`shell-${id}`} x1="0" y1="0" x2="1" y2="0.35">
              <stop offset="0" stop-color="#3a4c60" />
              <stop offset="0.45" stop-color="#2a3948" />
              <stop offset="1" stop-color="#161f29" />
            </linearGradient>
            {/* inset panel sits in shadow */}
            <linearGradient id={`panel-${id}`} x1="0" y1="0" x2="1" y2="0.2">
              <stop offset="0" stop-color="#243141" />
              <stop offset="0.5" stop-color="#1b2733" />
              <stop offset="1" stop-color="#131b24" />
            </linearGradient>
            <linearGradient id={`base-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#2b3a4a" />
              <stop offset="1" stop-color="#141c25" />
            </linearGradient>
            <filter id={`soft-${id}`} x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </>
        ))}
      </defs>
      <Seat x={8} id="d" heat={driverHeat} cool={driverCool} />
      <Seat x={112} id="p" heat={passengerHeat} cool={passengerCool} />
    </svg>
  )
}
