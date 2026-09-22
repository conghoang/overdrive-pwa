import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { carPhoto } from '../lib/settings'
import { chargeEtaMin, chargeTargetPct, vehicleState } from '../lib/store'
import { distanceUnitLabel, fmtDistance, fmtEta, fmtNum } from '../lib/format'
import { t } from '../lib/i18n'
import { windowsOpenCount } from '../lib/vehicle'
import { IconBattery, IconBolt, IconFuel, IconLock, IconUnlock, IconWindow } from './icons'
import type { StatusResponse } from '../lib/types'

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
  const charging = !!s.charging?.charging
  const power = s.charging?.chargingPowerKW ?? s.charging?.powerKw
  const photo = carPhoto.value || DEFAULT_PHOTO
  const isPhev = !!s.range?.isPhev
  const range = s.range?.totalRangeKm ?? s.range?.elecRangeKm

  // At-a-glance parked state under the car: ignition, locks, windows — the
  // three things you check before walking away, in the slot the gear pills held.
  const vs = vehicleState.value
  const powerOn = !!s.acc
  const doors = vs?.doors?.overall // 1 locked, 2 unlocked, else unknown
  const winOpen = windowsOpenCount(vs?.windows)

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

      {/* Ignition / locks / windows — the walk-away checks, in the slot the
          gear pills used to hold. Doors and windows carry Unknown states so a
          car that hasn't reported never shows a false "Locked"/"Closed". */}
      <div class="hero-state">
        <div class="hs-cell">
          <span class="hs-ico"><IconBolt size={18} /></span>
          <span class={'hs-val ' + (powerOn ? 'g' : 'm')}>{powerOn ? t('common.on') : t('common.off')}</span>
          <span class="hs-lbl">{t('vitals.power')}</span>
        </div>
        <div class="hs-cell">
          <span class="hs-ico">{doors === 2 ? <IconUnlock size={18} /> : <IconLock size={18} />}</span>
          {doors === 1 ? (
            <span class="hs-val g">{t('status.locked')}</span>
          ) : doors === 2 ? (
            <span class="hs-val w">{t('status.unlocked')}</span>
          ) : (
            <span class="hs-val m">{t('common.unknown')}</span>
          )}
          <span class="hs-lbl">{t('status.doors')}</span>
        </div>
        <div class="hs-cell">
          <span class="hs-ico"><IconWindow size={18} /></span>
          {winOpen == null ? (
            <span class="hs-val m">{t('common.unknown')}</span>
          ) : winOpen > 0 ? (
            <span class="hs-val w">{t('status.open_count', { n: winOpen })}</span>
          ) : (
            <span class="hs-val g">{t('status.closed')}</span>
          )}
          <span class="hs-lbl">{t('status.windows')}</span>
        </div>
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
