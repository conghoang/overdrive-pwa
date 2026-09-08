/**
 * Stylised side-view SUV that recolors to `color` (approximates a Sealion 6 DMi
 * silhouette — not a photographic likeness). Body takes the chosen paint colour;
 * glass, wheels and trim are fixed.
 */
export function CarImage({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 400 190" width="100%" class="car-svg" role="img" aria-label="Car">
      <defs>
        <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={color} stop-opacity="1" />
          <stop offset="1" stop-color={color} stop-opacity="0.82" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#bfe0ff" stop-opacity="0.45" />
          <stop offset="1" stop-color="#4a6b8a" stop-opacity="0.35" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="200" cy="171" rx="168" ry="10" fill="#000" opacity="0.28" />

      {/* body with wheel arches cut into the bottom edge */}
      <path
        d="M18 132
           Q18 114 44 110
           L96 102
           Q118 74 158 68
           L256 66
           Q300 68 328 94
           L364 106
           Q386 112 386 132
           L386 146
           L332 146
           A30 30 0 0 0 272 146
           L128 146
           A30 30 0 0 0 68 146
           L34 146
           Q18 146 18 136 Z"
        fill="url(#paint)"
        stroke="rgba(255,255,255,0.14)"
        stroke-width="1.5"
      />

      {/* greenhouse / windows */}
      <path
        d="M116 100 Q134 78 162 76 L232 76 Q262 78 282 100 Z"
        fill="url(#glass)"
        stroke="rgba(255,255,255,0.18)"
        stroke-width="1"
      />
      <path d="M198 78 L198 100" stroke="rgba(255,255,255,0.22)" stroke-width="2" />

      {/* light strip + door line */}
      <path d="M96 118 L300 116" stroke="rgba(0,0,0,0.18)" stroke-width="2" />
      <rect x="360" y="112" width="20" height="9" rx="3" fill="#ffe9b0" opacity="0.85" />
      <rect x="26" y="122" width="12" height="8" rx="3" fill="#ff5a5a" opacity="0.7" />

      {/* wheels */}
      {[98, 302].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="146" r="30" fill="#14181d" />
          <circle cx={cx} cy="146" r="29" fill="none" stroke="#2a2f36" stroke-width="2" />
          <circle cx={cx} cy="146" r="14" fill="#3a424c" />
          <circle cx={cx} cy="146" r="5" fill="#8894a2" />
        </g>
      ))}
    </svg>
  )
}
