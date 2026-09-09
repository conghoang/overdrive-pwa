/**
 * Climate card banner: the cabin airflow image, with leaf-in-bubble particles
 * drifting along the airflow path. Their speed follows the car's actual fan
 * level (1-7) — fan 7 is roughly 3x faster than fan 1.
 *
 * They flow whenever air is actually moving, which is NOT just `acOn`: in AUTO
 * the car drives the blower itself and may report a fan level without the manual
 * AC flag, so a reported fan > 0 counts as flowing too.
 */

interface Bubble {
  /** start/end position as % of the banner, following the vent-to-cabin flow */
  x0: number
  y0: number
  x1: number
  y1: number
  size: number
  delay: number
}

// Roughly traces the streams in the artwork: out of the dash vents on the right,
// fanning down and toward the viewer. Every path drops at least 80% of the
// banner height so the drift reads as real airflow, not a twitch.
const BUBBLES: Bubble[] = [
  { x0: 57, y0: 4, x1: 88, y1: 90, size: 26, delay: 0 },
  { x0: 65, y0: 2, x1: 98, y1: 84, size: 18, delay: 1.1 },
  { x0: 61, y0: 6, x1: 79, y1: 96, size: 22, delay: 2.2 },
  { x0: 71, y0: 1, x1: 96, y1: 88, size: 15, delay: 3.0 },
  { x0: 55, y0: 8, x1: 71, y1: 94, size: 19, delay: 4.1 },
]

export function ClimateBanner({ active, fanLevel }: { active: boolean; fanLevel?: number }) {
  const blowing = (fanLevel ?? 0) > 0
  const flowing = active || blowing
  // Fan 1 → ~9s per drift, fan 7 → ~3s. Unknown fan while on: assume mid.
  const fan = Math.min(7, Math.max(1, fanLevel || 3))
  const duration = 9.5 - (fan - 1) * 1.05

  return (
    <div class={'climate-banner' + (flowing ? ' on' : '')}>
      <img src={`${import.meta.env.BASE_URL}car/climate.webp`} alt="" />
      {flowing && (
        <div class="cb-flow" aria-hidden="true">
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              class="cb-bubble"
              style={{
                left: `${b.x0}%`,
                top: `${b.y0}%`,
                width: `${b.size}px`,
                height: `${b.size}px`,
                // Travel vector, resolved in the keyframes. MUST be container
                // units: a % inside translate() resolves against the bubble's
                // own 15-26px box, which made the leaves barely move.
                ['--dx' as string]: `${b.x1 - b.x0}cqw`,
                ['--dy' as string]: `${b.y1 - b.y0}cqh`,
                animationDuration: `${duration}s`,
                animationDelay: `${-b.delay}s`, // negative = already in flight
              }}
            >
              <svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden="true">
                <path
                  d="M20 4C11 4 5 8.5 5 15.5c0 1.6.4 3 1.1 4.2C8 15 12 12 18 10.5c-4.6 2.4-7.6 5.7-9 10 1.2.6 2.6.9 4 .9 7 0 11-6 11-13 0-1.6-.3-3-1-4.4z"
                  fill="#8ddb3f"
                  opacity="0.95"
                />
              </svg>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
