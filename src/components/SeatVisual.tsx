/**
 * Seats drawn to match the car's own Seats screen: a tilted 3/4 view where the
 * seating surfaces — a narrow insert down the backrest and across the cushion —
 * carry the live state colour, with thick grey bolsters either side.
 *
 * BYD's colour language: orange = heating, blue = ventilation. Dim at Low, full
 * at High. Geometry was matched against a photo of the head unit side by side.
 */

const HEAT_A = '#ffa254'
const HEAT_B = '#f5822a'
const HEAT_C = '#d96a14'
const COOL_A = '#7cc4ff'
const COOL_B = '#3d9bf5'
const COOL_C = '#1f7ad4'

function Seat({ x, heat, cool, id }: { x: number; heat: number; cool: number; id: string }) {
  const on = heat > 0 || cool > 0
  const isHeat = heat > 0
  const strong = (isHeat ? heat : cool) >= 2
  const acc = `url(#acc-${id})`
  // Inactive seats keep the surface visible, just neutral.
  const surfaceOpacity = on ? (strong ? 1 : 0.6) : 1

  return (
    <g transform={`translate(${x} 0)`}>
      <defs>
        <linearGradient id={`acc-${id}`} x1="0" y1="0" x2="1" y2="0.5">
          {on ? (
            <>
              <stop offset="0" stop-color={isHeat ? HEAT_A : COOL_A} />
              <stop offset="0.6" stop-color={isHeat ? HEAT_B : COOL_B} />
              <stop offset="1" stop-color={isHeat ? HEAT_C : COOL_C} />
            </>
          ) : (
            <>
              <stop offset="0" stop-color="#8d98a4" />
              <stop offset="1" stop-color="#6d7783" />
            </>
          )}
        </linearGradient>
      </defs>

      <g transform="rotate(-7 100 100)">
        {/* glow when active */}
        {on && (
          <g filter={`url(#soft-${id})`} opacity={strong ? 0.5 : 0.26}>
            <path d="M88 34 Q87 26 95 24 L112 20 Q120 19 122 27 L134 97 Q136 106 127 108 L104 113 Q95 115 93 106 Z" fill={isHeat ? HEAT_B : COOL_B} />
            <path d="M82 120 Q80 113 89 111 L120 105 Q129 103 133 112 L144 134 Q148 143 136 146 L100 153 Q90 155 87 146 Z" fill={isHeat ? HEAT_B : COOL_B} />
          </g>
        )}

        {/* cushion */}
        <path d="M58 120 Q54 109 69 106 L124 96 Q141 93 148 107 L166 141 Q174 156 154 160 L92 172 Q73 176 67 161 Z" fill="url(#seatTop)" />
        <path d="M82 120 Q80 113 89 111 L120 105 Q129 103 133 112 L144 134 Q148 143 136 146 L100 153 Q90 155 87 146 Z" fill={acc} opacity={surfaceOpacity} />
        <path d="M67 161 Q73 176 92 172 L154 160 Q174 156 166 141 L169 152 Q176 168 154 172 L92 184 Q72 188 66 172 Z" fill="#9ba5b0" />

        {/* backrest */}
        <path d="M114 20 Q126 18 129 31 L144 108 Q147 122 132 125 L126 126 Q139 122 136 109 L121 33 Q118 22 108 23 Z" fill="#98a3ae" />
        <path d="M62 30 Q60 17 75 14 L114 6 Q129 3 132 18 L147 105 Q150 121 133 124 L82 134 Q66 137 63 121 Z" fill="url(#seatBody)" />
        <path d="M88 34 Q87 26 95 24 L112 20 Q120 19 122 27 L134 97 Q136 106 127 108 L104 113 Q95 115 93 106 Z" fill={acc} opacity={surfaceOpacity} />
        <path d="M88 34 Q82 70 93 107" stroke="rgba(105,116,128,0.55)" stroke-width="2.2" fill="none" />
        <path d="M122 27 Q131 64 136 99" stroke="rgba(105,116,128,0.45)" stroke-width="2.2" fill="none" />
        <path d="M68 26 Q94 12 124 12" stroke="rgba(255,255,255,0.5)" stroke-width="2.6" fill="none" stroke-linecap="round" />

        {/* headrest */}
        <path d="M88 4 L92 17 L101 15 L97 2 Z" fill="#8b959f" />
        <path d="M76 -16 Q74 -26 89 -29 L117 -35 Q130 -37 133 -26 L137 -9 Q140 1 124 4 L96 10 Q82 13 80 2 Z" fill="url(#seatBody)" />
      </g>
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
    <svg viewBox="10 -40 400 240" class="seat-visual" aria-hidden="true">
      <defs>
        <linearGradient id="seatBody" x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" stop-color="#e6e9ed" />
          <stop offset="0.45" stop-color="#ccd3da" />
          <stop offset="1" stop-color="#9ba5b0" />
        </linearGradient>
        <linearGradient id="seatTop" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stop-color="#e8ebee" />
          <stop offset="1" stop-color="#aab4be" />
        </linearGradient>
        <filter id="soft-d" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="10" /></filter>
        <filter id="soft-p" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="10" /></filter>
      </defs>
      <Seat x={-30} id="d" heat={driverHeat} cool={driverCool} />
      <Seat x={160} id="p" heat={passengerHeat} cool={passengerCool} />
    </svg>
  )
}
