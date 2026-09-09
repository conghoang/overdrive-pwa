import { useState } from 'preact/hooks'
import { carPhoto } from '../lib/settings'
import { chargeEtaMin, chargeTargetPct } from '../lib/store'
import { distanceUnitLabel, fmtDistance, fmtEta, fmtNum } from '../lib/format'
import { t } from '../lib/i18n'
import { IconBolt } from './icons'
import { CarImage } from './CarImage'
import type { StatusResponse } from '../lib/types'

const GEARS = ['P', 'R', 'N', 'D']
export const DEFAULT_PHOTO = `${import.meta.env.BASE_URL}car/sealion6.webp`

/** Reference-style vehicle hero: model, range, car photo, P R N D, charging. */
export function CarHero({ s }: { s: StatusResponse }) {
  const [imgOk, setImgOk] = useState(true)
  const unit = s.distanceUnit || 'km'
  const range = s.range?.totalRangeKm ?? s.range?.elecRangeKm
  const gear = s.recordingStatus?.gear
  const charging = !!s.charging?.charging
  const power = s.charging?.chargingPowerKW ?? s.charging?.powerKw
  const photo = carPhoto.value || DEFAULT_PHOTO

  return (
    <div class="card car-hero-card">
      <div class="veh-range">
        <span class="veh-range-num mono">{fmtDistance(range, unit)}</span>
        <span class="veh-range-unit">{distanceUnitLabel(unit)}</span>
      </div>
      <div class="veh-range-label">{t('car.range')}</div>

      {imgOk ? (
        <img class="car-photo" src={photo} alt="" onError={() => setImgOk(false)} />
      ) : (
        <div class="car-photo"><CarImage color="#c7ccd1" /></div>
      )}

      <div class="prnd">
        {GEARS.map((g) => (
          <span key={g} class={'prnd-item' + (gear === g ? ' on' : '')}>{g}</span>
        ))}
      </div>

      {charging ? (
        <div class="charging-wrap">
          <div class="charging-line on">
            <IconBolt size={16} /> {t('car.charging')}{power ? ` · ${fmtNum(power, 1)} kW` : ''}
          </div>
          {chargeEtaMin.value != null && chargeEtaMin.value > 0 && (
            <div class="charging-sub">
              ~{fmtEta(chargeEtaMin.value)} {t('car.to')} {chargeTargetPct.value ? `${chargeTargetPct.value}%` : t('car.full')}
            </div>
          )}
        </div>
      ) : (
        <div class="charging-line">
          {s.acc ? t('car.ready') : s.charging?.plugged ? t('car.plugged') : t('car.parked')}
        </div>
      )}
    </div>
  )
}
