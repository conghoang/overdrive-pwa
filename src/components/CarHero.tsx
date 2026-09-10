import { useState } from 'preact/hooks'
import { carPhoto } from '../lib/settings'
import { chargeEtaMin, chargeTargetPct, odometer } from '../lib/store'
import { distanceUnitLabel, fmtDistance, fmtEta, fmtNum, fmtOdo } from '../lib/format'
import { t } from '../lib/i18n'
import { effectiveGear } from '../lib/vehicle'
import { IconBolt } from './icons'
import type { StatusResponse } from '../lib/types'

const GEARS = ['P', 'R', 'N', 'D']
export const DEFAULT_PHOTO = `${import.meta.env.BASE_URL}car/sealion6.webp`

/**
 * Vehicle hero: odometer, car photo, P R N D, charging.
 *
 * Prefers the ODOMETER over estimated range — range already leads the energy
 * card below, so repeating it here wasted the headline.
 *
 * Falls back to range when the car cannot report an odometer, which today is
 * every release build: the reading is only reachable through the BYD SDK
 * device, and no HTTP endpoint serves it (see api.getOdometer). Better a
 * duplicated range than a headline reading "--".
 */
export function CarHero({ s }: { s: StatusResponse }) {
  const [imgOk, setImgOk] = useState(true)
  const unit = s.distanceUnit || 'km'
  const gear = effectiveGear(s)
  const charging = !!s.charging?.charging
  const power = s.charging?.chargingPowerKW ?? s.charging?.powerKw
  const photo = carPhoto.value || DEFAULT_PHOTO
  const odo = odometer.value
  const range = s.range?.totalRangeKm ?? s.range?.elecRangeKm
  /*
   * Null means the odometer has not been READ yet; the store only replaces it
   * once the call settles, and a car that cannot report one settles on an
   * object whose totalKm is null. Those two states have to be told apart.
   *
   * Treating "not read yet" as "no odometer" made the headline show estimated
   * range on first paint and then swap — number AND label — a beat later when
   * the reading landed. So the odometer is assumed until proven otherwise: the
   * label is right immediately and only the number fills in. Falling back to
   * range still happens, just for cars that genuinely have no odometer (trip
   * recording off), where it is the correct final answer rather than a flash.
   */
  const odoRead = odo !== null
  const hasOdo = odo?.totalKm != null
  const showOdo = !odoRead || hasOdo

  return (
    <div class="card car-hero-card">
      <div class="veh-range">
        <span class="veh-range-num mono">
          {showOdo ? fmtOdo(odo?.totalKm, unit) : fmtDistance(range, unit)}
        </span>
        <span class="veh-range-unit">{distanceUnitLabel(unit)}</span>
      </div>
      <div class="veh-range-label">{showOdo ? t('car.odo') : t('car.range')}</div>

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
        <div class="car-photo">
          {/* A static file, not inline SVG: it never changes colour (one fixed
              call site) and it is the fallback for a fallback — so it stays out
              of the bundle and is only fetched if the photo above actually
              fails. */}
          <img class="car-svg" src={`${import.meta.env.BASE_URL}car/silhouette.svg`} alt="" />
        </div>
      )}

      {/* Read aloud, "P R N D" is four letters with nothing to say which one
          is current — the selected gear is pure colour. The group carries the
          answer as text so it does not depend on seeing the highlight. */}
      <div class="prnd" role="img" aria-label={`${t('vitals.gear')}: ${gear ?? '--'}`}>
        {GEARS.map((g) => (
          <span key={g} class={'prnd-item' + (gear === g ? ' on' : '')} aria-hidden="true">{g}</span>
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
