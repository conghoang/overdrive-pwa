import { fmtPressure, pressureUnitLabel } from '../lib/format'
import { t } from '../lib/i18n'
import { tyreReasonKey, tyreSeverity } from '../lib/tyres'
import type { TyreSeverity } from '../lib/tyres'
import type { TyresState } from '../lib/types'

type Corner = 'fl' | 'fr' | 'rl' | 'rr'
const FRONT: Corner[] = ['fl', 'fr']

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
