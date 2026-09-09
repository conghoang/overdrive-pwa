import { fmtPressure, pressureUnitLabel } from '../lib/format'
import { t } from '../lib/i18n'
import { tyreReasonKey, tyreSeverity } from '../lib/tyres'
import type { TyreSeverity } from '../lib/tyres'
import type { TyresState } from '../lib/types'

type Corner = 'fl' | 'fr' | 'rl' | 'rr'
const FRONT: Corner[] = ['fl', 'fr']

/** Wheel colours per severity — red for alert, orange for warn, as OD does. */
const WHEEL_COLOR: Record<TyreSeverity, string> = {
  alert: 'var(--danger)',
  warn: 'var(--warning)',
  muted: 'var(--wheel-muted)',
  normal: 'var(--wheel-normal)',
}

export function Tyres({ tyres, unit }: { tyres: TyresState | undefined; unit: string }) {
  const available = !!tyres?.available
  const limits = tyres?.limits

  const sev = (key: Corner): TyreSeverity =>
    tyreSeverity(tyres?.[key], FRONT.includes(key), limits)

  function read(key: Corner) {
    const s = sev(key)
    const reason = s === 'normal' ? null : tyreReasonKey(tyres?.[key], FRONT.includes(key), limits)
    return (
      <div class={`tyre-read ${key} ${s}`}>
        <span class="p mono">{fmtPressure(tyres?.[key], unit)}</span>
        <span class="u">{pressureUnitLabel(unit)}</span>
        {reason && <span class="tyre-reason">{t(reason)}</span>}
      </div>
    )
  }

  // Each wheel is drawn in its own state colour, so the diagram reads at a glance
  // even before you look at the numbers.
  function wheel(key: Corner, x: number, y: number) {
    const s = sev(key)
    const flag = s === 'alert' || s === 'warn'
    const c = WHEEL_COLOR[s]
    return (
      <g>
        {flag && <rect x={x - 2.5} y={y - 2.5} width={14} height={31} rx={6} fill={c} opacity="0.22" />}
        <rect x={x} y={y} width={9} height={26} rx={4} fill={c} stroke={c} stroke-width="0.8" />
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
