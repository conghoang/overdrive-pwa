import { useState } from 'preact/hooks'
import { carPhoto } from '../lib/settings'
import { chargeEtaMin, chargeTargetPct, odometer } from '../lib/store'
import { distanceUnitLabel, fmtEta, fmtNum, fmtOdo } from '../lib/format'
import { t } from '../lib/i18n'
import { IconBolt } from './icons'
import { CarImage } from './CarImage'
import type { StatusResponse } from '../lib/types'

const GEARS = ['P', 'R', 'N', 'D']
export const DEFAULT_PHOTO = `${import.meta.env.BASE_URL}car/sealion6.webp`

/**
 * Vehicle hero: odometer, car photo, P R N D, charging.
 *
 * Shows the ODOMETER rather than estimated range — range is already the whole
 * point of the energy card below, and repeating it here wasted the headline.
 */
export function CarHero({ s }: { s: StatusResponse }) {
  const [imgOk, setImgOk] = useState(true)
  const unit = s.distanceUnit || 'km'
  const gear = s.recordingStatus?.gear
  const charging = !!s.charging?.charging
  const power = s.charging?.chargingPowerKW ?? s.charging?.powerKw
  const photo = carPhoto.value || DEFAULT_PHOTO
  const odo = odometer.value

  return (
    <div class="card car-hero-card">
      <div class="veh-range">
        <span class="veh-range-num mono">{fmtOdo(odo?.totalKm, unit)}</span>
        <span class="veh-range-unit">{distanceUnitLabel(unit)}</span>
      </div>
      <div class="veh-range-label">{t('car.odo')}</div>

      {/* EV / HEV split of that total. A BEV or a trim without the split leaves
          hevKm unavailable, so each leg is rendered only when the car reports
          it — rather than showing a confident "0 km" that isn't true. */}
      {(odo?.evKm != null || odo?.hevKm != null) && (
        <div class="odo-split">
          {odo?.evKm != null && (
            <div class="odo-leg">
              <span class="odo-leg-k">{t('car.odo_ev')}</span>
              <span class="odo-leg-v mono">{fmtOdo(odo.evKm, unit)}<small> {distanceUnitLabel(unit)}</small></span>
            </div>
          )}
          {odo?.hevKm != null && (
            <div class="odo-leg">
              <span class="odo-leg-k">{t('car.odo_hev')}</span>
              <span class="odo-leg-v mono">{fmtOdo(odo.hevKm, unit)}<small> {distanceUnitLabel(unit)}</small></span>
            </div>
          )}
        </div>
      )}

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
