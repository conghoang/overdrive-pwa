/**
 * Climate card banner: the cabin airflow image, with leaf-in-bubble particles
 * drifting along the airflow path. Their speed follows the car's actual fan
 * level (1-7) — fan 7 is roughly 3x faster than fan 1 — and they stop entirely
 * when the AC is off, so the animation reports real state rather than decorating.
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
// fanning down and toward the viewer.
const BUBBLES: Bubble[] = [
  { x0: 58, y0: 14, x1: 88, y1: 78, size: 26, delay: 0 },
  { x0: 66, y0: 10, x1: 99, y1: 55, size: 18, delay: 1.1 },
  { x0: 62, y0: 18, x1: 78, y1: 92, size: 22, delay: 2.2 },
  { x0: 72, y0: 12, x1: 96, y1: 84, size: 15, delay: 3.0 },
  { x0: 56, y0: 20, x1: 70, y1: 88, size: 19, delay: 4.1 },
]

export function ClimateBanner({ active, fanLevel }: { active: boolean; fanLevel?: number }) {
  // Fan 1 → ~9s per drift, fan 7 → ~3s. Unknown fan while on: assume mid.
  const fan = Math.min(7, Math.max(1, fanLevel || 3))
  const duration = 9.5 - (fan - 1) * 1.05

  return (
    <div class={'climate-banner' + (active ? ' on' : '')}>
      <img src={`${import.meta.env.BASE_URL}car/climate.webp`} alt="" />
      {active && (
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
                // Travel vector, resolved in the keyframes.
                ['--dx' as string]: `${b.x1 - b.x0}%`,
                ['--dy' as string]: `${b.y1 - b.y0}%`,
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
