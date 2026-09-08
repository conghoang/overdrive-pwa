import { useState } from 'preact/hooks'

/**
 * Cabin photo with a live glow over each front seat: blue for ventilation,
 * warm red for heating, brighter at High. The bundled image is desaturated so
 * the ONLY colour on the seats is the real state — otherwise it would appear
 * to be cooling even with everything off.
 *
 * Falls back to a drawn seat pair if the image can't load.
 */

const COOL = '74, 168, 255'
const HEAT = '255, 106, 74'

// Seat centres as a % of the image, measured off the artwork (the seats sit at
// x≈180/355 of 530 and y≈208 of 310).
const SEATS = {
  driver: { x: 34, y: 67 },
  passenger: { x: 67, y: 67 },
}

function glowStyle(heat: number, cool: number, pos: { x: number; y: number }) {
  const rgb = heat > 0 ? HEAT : cool > 0 ? COOL : null
  if (!rgb) return { opacity: 0 }
  const level = heat > 0 ? heat : cool
  // Strong enough to read as illuminated upholstery, like the reference.
  const a = level >= 2 ? 0.95 : 0.6
  return {
    opacity: 1,
    background:
      `radial-gradient(ellipse 13% 26% at ${pos.x}% ${pos.y}%, ` +
      `rgba(${rgb}, ${a}) 0%, rgba(${rgb}, ${a * 0.75}) 40%, ` +
      `rgba(${rgb}, ${a * 0.3}) 70%, rgba(${rgb}, 0) 100%)`,
  }
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
  const [ok, setOk] = useState(true)
  if (!ok) return <SeatFallback driverHeat={driverHeat} driverCool={driverCool} passengerHeat={passengerHeat} passengerCool={passengerCool} />

  return (
    <div class="cabin">
      <img
        class="cabin-img"
        src={`${import.meta.env.BASE_URL}car/cabin.webp`}
        alt=""
        onError={() => setOk(false)}
      />
      <div class="cabin-glow" style={glowStyle(driverHeat, driverCool, SEATS.driver)} />
      <div class="cabin-glow" style={glowStyle(passengerHeat, passengerCool, SEATS.passenger)} />
    </div>
  )
}

/** Drawn seats, used only if the cabin image fails to load. */
function SeatFallback({
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
  const seat = (x: number, heat: number, cool: number, id: string) => {
    const c = heat > 0 ? '#ff6a4a' : cool > 0 ? '#4aa8ff' : null
    return (
      <g transform={`translate(${x} 0)`}>
        <rect x="18" y="20" width="64" height="76" rx="22" fill="#243141" stroke={c || 'rgba(190,215,240,0.25)'} stroke-width="1.4" />
        <rect x="14" y="94" width="72" height="34" rx="16" fill="#1b2733" stroke={c || 'rgba(190,215,240,0.2)'} stroke-width="1.2" />
        <rect x="34" y="4" width="32" height="16" rx="7" fill="#2a3948" />
        {c && <rect x="18" y="20" width="64" height="76" rx="22" fill={c} opacity="0.22" filter={`url(#fb-${id})`} />}
      </g>
    )
  }
  return (
    <svg viewBox="0 0 220 136" class="seat-visual" aria-hidden="true">
      <defs>
        <filter id="fb-d"><feGaussianBlur stdDeviation="6" /></filter>
        <filter id="fb-p"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      {seat(8, driverHeat, driverCool, 'd')}
      {seat(112, passengerHeat, passengerCool, 'p')}
    </svg>
  )
}
