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

  // Each wheel is drawn in its own state colour over the car photo, so the
  // diagram reads at a glance even before you look at the numbers. Coordinates
  // are in the overlay's 524×1000 space (matched to the photo aspect).
  function wheel(key: Corner, x: number, y: number) {
    const s = sev(key)
    const flag = s === 'alert' || s === 'warn'
    const c = WHEEL_COLOR[s]
    return (
      <g>
        {flag && <rect x={x - 9} y={y - 9} width={48} height={108} rx={20} fill={c} opacity="0.22" />}
        <rect x={x} y={y} width={30} height={90} rx={13} fill={c} stroke="rgba(0,0,0,0.3)" stroke-width="2" />
      </g>
    )
  }

  return (
    <div class="card tyre-card">
      <div class="card-title">{t('tyre.title')}</div>
      {available ? (
        <div class="tyre-diagram">
          {read('fl')}
          {read('fr')}
          <div class="tyre-car">
            <div class="tyre-car-photo-wrap">
              <img class="tyre-car-photo" src={`${import.meta.env.BASE_URL}car/topview.webp`} alt="" />
              <svg class="tyre-car-ov" viewBox="0 0 524 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                {/* wheels — colour = that corner's pressure state */}
                {wheel('fl', 8, 360)}
                {wheel('fr', 486, 360)}
                {wheel('rl', 8, 735)}
                {wheel('rr', 486, 735)}
              </svg>
            </div>
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
