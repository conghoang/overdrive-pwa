import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { carPhoto } from '../lib/settings'
import { chargeEtaMin, chargeTargetPct } from '../lib/store'
import { distanceUnitLabel, fmtDistance, fmtEta, fmtNum } from '../lib/format'
import { t } from '../lib/i18n'
import { effectiveGear } from '../lib/vehicle'
import { IconBattery, IconBolt, IconFuel } from './icons'
import type { StatusResponse } from '../lib/types'

const GEARS = ['P', 'R', 'N', 'D']
export const DEFAULT_PHOTO = `${import.meta.env.BASE_URL}car/sealion6.webp`

/**
 * One energy source as an inline proportion bar under the combined range —
 * icon, a fill bar, and the percent. A null reading shows an empty bar and
 * "--" rather than a confident 0%, keeping "empty" distinct from "not said".
 */
function EnergyBar({ icon, pct, color }: { icon: JSX.Element; pct: number | undefined | null; color: string }) {
  const has = typeof pct === 'number'
  const w = has ? Math.max(0, Math.min(100, pct as number)) : 0
  return (
    <div class="hero-energy-item">
      <span class="hero-energy-ico" style={{ color }}>{icon}</span>
      <span class="hero-bar"><i style={{ width: `${w}%`, background: color }} /></span>
      <span class="hero-energy-pct mono">{has ? `${Math.round(pct as number)}%` : '--'}</span>
    </div>
  )
}

/**
 * Vehicle hero: combined range, battery/fuel bars, car photo, P R N D, charging.
 *
 * Leads with the total driving range and the battery (plus fuel, on a PHEV) as
 * inline bars — the header BYD's own app leads with. The odometer is not shown:
 * on every release build it is unreachable (only the BYD SDK device serves it,
 * no HTTP endpoint does — see api.getOdometer), so it only ever fell back to
 * this same range anyway.
 */
export function CarHero({ s }: { s: StatusResponse }) {
  const [imgOk, setImgOk] = useState(true)
  const unit = s.distanceUnit || 'km'
  const gear = effectiveGear(s)
  const charging = !!s.charging?.charging
  const power = s.charging?.chargingPowerKW ?? s.charging?.powerKw
  const photo = carPhoto.value || DEFAULT_PHOTO
  const isPhev = !!s.range?.isPhev
  const range = s.range?.totalRangeKm ?? s.range?.elecRangeKm

  return (
    <div class="card car-hero-card">
      <div class="veh-range">
        <span class="veh-range-num mono">{fmtDistance(range, unit)}</span>
        <span class="veh-range-unit">{distanceUnitLabel(unit)}</span>
      </div>

      {/* Battery — and, on a PHEV, fuel — as inline bars under the range, the
          way BYD's app leads its home screen. Fuel only when this trim has it,
          so a BEV shows a single centred battery bar rather than a lone gap. */}
      <div class="hero-energy">
        <EnergyBar icon={<IconBattery size={16} />} pct={s.soc?.percent} color="var(--success)" />
        {isPhev && <span class="hero-energy-div" aria-hidden="true" />}
        {isPhev && (
          <EnergyBar icon={<IconFuel size={15} class="ico-fuel" />} pct={s.range?.fuelPercent} color="var(--m-orange)" />
        )}
      </div>

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
