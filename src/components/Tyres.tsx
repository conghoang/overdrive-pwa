import { fmtPressure, pressureUnitLabel } from '../lib/format'
import { t } from '../lib/i18n'
import type { TyreCorner, TyresState } from '../lib/types'

function abnormal(t: TyreCorner | undefined): boolean {
  if (!t) return false
  return (t.pressureState ?? 0) !== 0 || (t.airLeakState ?? 0) !== 0
}

export function Tyres({ tyres, unit }: { tyres: TyresState | undefined; unit: string }) {
  const available = !!tyres?.available

  function read(key: 'fl' | 'fr' | 'rl' | 'rr') {
    const t = tyres?.[key]
    return (
      <div class={'tyre-read ' + key + (abnormal(t) ? ' warn' : '')}>
        <span class="p mono">{fmtPressure(t, unit)}</span>
        <span class="u">{pressureUnitLabel(unit)}</span>
      </div>
    )
  }

  // Each wheel is drawn in its own state colour, so the diagram reads at a glance
  // even before you look at the numbers.
  function wheel(key: 'fl' | 'fr' | 'rl' | 'rr', x: number, y: number) {
    const warn = abnormal(tyres?.[key])
    return (
      <g>
        {warn && <rect x={x - 2.5} y={y - 2.5} width={14} height={31} rx={6} fill="var(--warning)" opacity="0.22" />}
        <rect
          x={x}
          y={y}
          width={9}
          height={26}
          rx={4}
          fill={warn ? 'var(--warning)' : '#9fb2c4'}
          stroke={warn ? 'var(--warning)' : '#c3d2df'}
          stroke-width="0.8"
        />
      </g>
    )
  }

  return (
    <div class="card">
      <div class="card-title">{t('tyre.title')}</div>
      {available ? (
        <div class="tyre-diagram">
          {read('fl')}
          {read('fr')}
          <div class="tyre-car">
            <svg viewBox="0 0 80 150" width="70" aria-hidden="true">
              {/* body */}
              <rect
                x="15"
                y="6"
                width="50"
                height="138"
                rx="22"
                fill="var(--surface-3)"
                stroke="var(--border-strong)"
                stroke-width="1.5"
              />
              {/* windscreen + rear glass + roof */}
              <path d="M25 30 Q40 21 55 30 L53 42 Q40 36 27 42 Z" fill="rgba(150,190,225,0.30)" />
              <rect x="27" y="52" width="26" height="40" rx="9" fill="rgba(150,190,225,0.13)" />
              <path d="M27 108 Q40 102 53 108 L55 120 Q40 113 25 120 Z" fill="rgba(150,190,225,0.22)" />
              {/* wheels — colour = that corner's state */}
              {wheel('fl', 7, 24)}
              {wheel('fr', 64, 24)}
              {wheel('rl', 7, 100)}
              {wheel('rr', 64, 100)}
            </svg>
          </div>
          {read('rl')}
          {read('rr')}
        </div>
      ) : (
        <div class="screen-sub">{t('tyre.unavailable')}</div>
      )}
    </div>
  )
}
