import type { DoorsState } from '../lib/types'

// 1 = locked, 2 = unlocked, anything else = unknown
function tone(v: number | undefined): { color: string; label: string } {
  if (v === 1) return { color: 'var(--success)', label: 'Locked' }
  if (v === 2) return { color: 'var(--warning)', label: 'Unlocked' }
  return { color: '#3a4653', label: 'Unknown' }
}

const DOORS: { key: keyof DoorsState; name: string; x: number; y: number }[] = [
  { key: 'lf', name: 'Front L', x: 214, y: 50 },
  { key: 'rf', name: 'Front R', x: 214, y: 100 },
  { key: 'lr', name: 'Rear L', x: 120, y: 50 },
  { key: 'rr', name: 'Rear R', x: 120, y: 100 },
  { key: 'trunk', name: 'Trunk', x: 52, y: 75 },
]

export function DoorStatus({ doors }: { doors: DoorsState | undefined }) {
  const overall = tone(doors?.overall)
  return (
    <div>
      <div class="spread" style={{ marginBottom: '10px' }}>
        <div class="card-title" style={{ margin: 0 }}>Doors</div>
        <span
          class="pill"
          style={{ color: overall.color, borderColor: overall.color, background: 'transparent' }}
        >
          {overall.label}
        </span>
      </div>

      <svg viewBox="0 0 300 150" width="100%" style={{ maxWidth: '320px', display: 'block', margin: '0 auto' }}>
        {/* top-view body (front to the right) */}
        <rect x="34" y="34" width="238" height="82" rx="30" fill="var(--surface-3)" stroke="var(--border-strong)" stroke-width="1.5" />
        <rect x="120" y="46" width="96" height="58" rx="16" fill="rgba(120,160,200,0.18)" stroke="var(--border-soft)" stroke-width="1" />
        <path d="M262 60 L272 75 L262 90" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" />

        {DOORS.map((d) => {
          const t = tone(doors?.[d.key] as number | undefined)
          return (
            <g key={d.key}>
              <circle cx={d.x} cy={d.y} r="11" fill={t.color} opacity={t.label === 'Unknown' ? 0.5 : 1} />
              <circle cx={d.x} cy={d.y} r="11" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1" />
            </g>
          )
        })}
      </svg>

      <div class="door-legend">
        {DOORS.map((d) => {
          const t = tone(doors?.[d.key] as number | undefined)
          return (
            <div class="door-legend-item" key={d.key}>
              <span class="door-dot" style={{ background: t.color, opacity: t.label === 'Unknown' ? 0.5 : 1 }} />
              <span class="door-name">{d.name}</span>
              <span class="door-state" style={{ color: t.color }}>{t.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
