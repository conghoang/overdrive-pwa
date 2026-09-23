import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { carPhoto } from '../lib/settings'
import { vehicleState } from '../lib/store'
import { distanceUnitLabel, fmtDistance } from '../lib/format'
import { t } from '../lib/i18n'
import { windowsOpenCount } from '../lib/vehicle'
import { IconBattery, IconBolt, IconFuel, IconLock, IconUnlock, IconWindow } from './icons'
import type { StatusResponse } from '../lib/types'

export const DEFAULT_PHOTO = `${import.meta.env.BASE_URL}car/sealion6.webp`

/**
 * One energy source under the combined range: its name, its own estimated
 * range in km (what you actually plan around, so it leads), the level as a
 * quiet percent, and a proportion bar. A null reading shows "--" and an empty
 * bar rather than a confident 0, keeping "empty" distinct from "not said".
 */
function EnergyLeg({
  icon,
  name,
  km,
  pct,
  color,
  unit,
}: {
  icon: JSX.Element
  name: string
  km: number | undefined | null
  pct: number | undefined | null
  color: string
  unit: string
}) {
  const hasPct = typeof pct === 'number'
  const w = hasPct ? Math.max(0, Math.min(100, pct as number)) : 0
  return (
    <div class="hero-leg">
      <div class="hero-leg-head">
        <span class="hero-leg-ico" style={{ color }}>{icon}</span>
        <span class="hero-leg-name">{name}</span>
        <span class="hero-leg-km mono" style={{ color }}>
          {km != null ? fmtDistance(km, unit) : '--'}<small> {distanceUnitLabel(unit)}</small>
        </span>
        <span class="hero-leg-pct mono">{hasPct ? `${Math.round(pct as number)}%` : '--'}</span>
      </div>
      <div class="hero-leg-bar"><i style={{ width: `${w}%`, background: color }} /></div>
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

      {/* The estimated range broken into its legs: battery, and fuel on a PHEV.
          Each leg leads with its own km so the two visibly sum to the headline.
          The grid stacks on a phone and goes two-up once the card is wide enough
          (a foldable unfolded); a BEV has one leg and fills the row. */}
      <div class="hero-energy">
        <EnergyLeg
          icon={<IconBattery size={16} />}
          name={t('energy.battery')}
          km={s.range?.elecRangeKm}
          pct={s.soc?.percent}
          color="var(--m-blue)"
          unit={unit}
        />
        {isPhev && (
          <EnergyLeg
            icon={<IconFuel size={15} class="ico-fuel" />}
            name={t('energy.fuel')}
            km={s.range?.fuelRangeKm}
            pct={s.range?.fuelPercent}
            color="var(--m-orange)"
            unit={unit}
          />
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

      {/* No charging line here — the dedicated charging card owns that, and
          repeating "Charging · kW · ETA" under the strip only duplicated it.
          Just a quiet ready/parked note when unplugged, where there is no
          charging card to say anything. */}
      {!charging && !s.charging?.plugged && (
        <div class="charging-line">{s.acc ? t('car.ready') : t('car.parked')}</div>
      )}
    </div>
  )
}
