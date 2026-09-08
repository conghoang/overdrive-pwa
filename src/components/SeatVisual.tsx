/**
 * Two front seats drawn from behind, glowing with their live climate state:
 * blue = ventilation (cooling), warm red = heating, brightness = level (1 low,
 * 2 high). Original artwork — and unlike a photo it reflects the real state.
 */

const COOL = '#4aa8ff'
const HEAT = '#ff6a4a'

function Seat({
  x,
  heat,
  cool,
  id,
}: {
  x: number
  heat: number
  cool: number
  id: string
}) {
  // Heating wins the glow when both are somehow on; level drives intensity.
  const active = heat > 0 ? HEAT : cool > 0 ? COOL : null
  const level = heat > 0 ? heat : cool
  const glow = active ? (level >= 2 ? 0.85 : 0.5) : 0

  return (
    <g transform={`translate(${x} 0)`}>
      {active && (
        <g filter={`url(#blur-${id})`} opacity={glow}>
          <rect x="14" y="18" width="72" height="86" rx="26" fill={active} />
          <rect x="8" y="104" width="84" height="40" rx="18" fill={active} />
        </g>
      )}

      {/* backrest */}
      <rect x="14" y="18" width="72" height="88" rx="26" fill={`url(#back-${id})`} />
      <rect
        x="14"
        y="18"
        width="72"
        height="88"
        rx="26"
        fill="none"
        stroke={active || 'rgba(190,215,240,0.30)'}
        stroke-width="1.6"
        opacity={active ? 0.9 : 1}
      />
      {/* centre panel — where the vents/heater sit */}
      <rect
        x="30"
        y="30"
        width="40"
        height="64"
        rx="16"
        fill={active ? active : 'rgba(150,190,225,0.10)'}
        opacity={active ? 0.35 : 1}
      />
      {/* headrest */}
      <rect x="32" y="2" width="36" height="22" rx="10" fill={`url(#back-${id})`} />
      <rect x="32" y="2" width="36" height="22" rx="10" fill="none" stroke="rgba(190,215,240,0.28)" stroke-width="1.4" />
      {/* cushion */}
      <rect x="8" y="104" width="84" height="42" rx="18" fill={`url(#seat-${id})`} />
      <rect x="8" y="104" width="84" height="42" rx="18" fill="none" stroke={active || 'rgba(190,215,240,0.26)'} stroke-width="1.5" opacity={active ? 0.85 : 1} />
      {/* stitch lines for a bit of form */}
      <path d="M50 24 L50 100" stroke="rgba(0,0,0,0.28)" stroke-width="1.2" />
      <path d="M50 110 L50 142" stroke="rgba(0,0,0,0.22)" stroke-width="1.2" />
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
    <svg viewBox="0 0 220 156" class="seat-visual" aria-hidden="true">
      <defs>
        <linearGradient id="back-d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2b3a4b" />
          <stop offset="1" stop-color="#1a2530" />
        </linearGradient>
        <linearGradient id="seat-d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#26333f" />
          <stop offset="1" stop-color="#17212b" />
        </linearGradient>
        <linearGradient id="back-p" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2b3a4b" />
          <stop offset="1" stop-color="#1a2530" />
        </linearGradient>
        <linearGradient id="seat-p" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#26333f" />
          <stop offset="1" stop-color="#17212b" />
        </linearGradient>
        <filter id="blur-d" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="blur-p" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <Seat x={10} id="d" heat={driverHeat} cool={driverCool} />
      <Seat x={120} id="p" heat={passengerHeat} cool={passengerCool} />
    </svg>
  )
}
