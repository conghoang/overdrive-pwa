import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { carPhoto } from '../lib/settings'
import { vehicleState } from '../lib/store'
import { distanceUnitLabel, fmtDistance } from '../lib/format'
import { t } from '../lib/i18n'
import { anyDoorOpen, windowsOpenCount } from '../lib/vehicle'
import { IconBattery, IconBolt, IconFuel, IconLock, IconUnlock, IconWindow } from './icons'
import type { DoorsOpenState, DoorsState, StatusResponse } from '../lib/types'

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
        <span class="hero-leg-pct mono" style={{ color }}>{hasPct ? `${Math.round(pct as number)}%` : '--'}</span>
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
  const [doorSheet, setDoorSheet] = useState(false)
  const unit = s.distanceUnit || 'km'
  const charging = !!s.charging?.charging
  const photo = carPhoto.value || DEFAULT_PHOTO
  const isPhev = !!s.range?.isPhev
  const range = s.range?.totalRangeKm ?? s.range?.elecRangeKm

  // At-a-glance parked state under the car: ignition, locks, windows — the
  // three things you check before walking away, in the slot the gear pills held.
  const vs = vehicleState.value
  const powerOn = !!s.acc
  const doorsLock = vs?.doors?.overall // 1 locked, 2 unlocked, else unknown
  // An open door means the car isn't secured, so it reads as Unlocked even if
  // the lock state still says locked (or never reported). The open state wins.
  const doorOpen = anyDoorOpen(vs?.doorsOpen)
  const unlocked = doorsLock === 2 || doorOpen === true
  const locked = doorsLock === 1 && doorOpen !== true
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
          color="var(--success)"
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
        {/* The cell stays a <div> — the column flex renders reliably on the
            car's older WebView (a <button> flex container does not), and a div's
            own onClick is reliably hit (a transparent overlay button was not).
            Button semantics are added with role + keyboard so it stays
            accessible. The chevron is pointer-events:none so it never eats the
            tap. */}
        <div
          class="hs-cell hs-cell-tap"
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-label={t('status.doors')}
          onClick={() => setDoorSheet(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setDoorSheet(true)
            }
          }}
        >
          <span class="hs-ico">{unlocked ? <IconUnlock size={18} /> : <IconLock size={18} />}</span>
          {locked ? (
            <span class="hs-val g">{t('status.locked')}</span>
          ) : unlocked ? (
            <span class="hs-val w">{t('status.unlocked')}</span>
          ) : (
            <span class="hs-val m">{t('common.unknown')}</span>
          )}
          <span class="hs-lbl">{t('status.doors')}</span>
          <svg class="hs-more" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
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

      {doorSheet && (
        <DoorStatusSheet
          doors={vs?.doors}
          open={vs?.doorsOpen}
          onClose={() => setDoorSheet(false)}
        />
      )}
    </div>
  )
}

/** The six openable areas, in a stable top-to-bottom reading order. */
const DOOR_AREAS: Array<keyof DoorsOpenState> = ['lf', 'rf', 'lr', 'rr', 'trunk', 'hood']

function lockChip(v: number | undefined): { cls: string; label: string } {
  if (v === 1) return { cls: 'g', label: t('status.locked') }
  if (v === 2) return { cls: 'w', label: t('status.unlocked') }
  return { cls: 'm', label: t('common.unknown') }
}
function openChip(v: number | undefined): { cls: string; label: string } {
  if (v === 1) return { cls: 'w', label: t('status.open') }
  if (v === 0) return { cls: 'g', label: t('status.closed') }
  return { cls: 'm', label: t('common.unknown') }
}

/**
 * Per-door breakdown behind the hero's lock pill: for each of the four doors
 * plus the trunk and bonnet, its lock state and its open state side by side.
 *
 * An area is listed only when the car reports at least one of the two for it,
 * so a trim that can't read the bonnet doesn't show a row of "Unknown /
 * Unknown"; when nothing is known at all, a single note stands in.
 */
function DoorStatusSheet({
  doors,
  open,
  onClose,
}: {
  doors: DoorsState | undefined
  open: DoorsOpenState | undefined
  onClose: () => void
}) {
  const rows = DOOR_AREAS.filter((k) => {
    const lv = doors?.[k]
    const ov = open?.[k]
    return lv === 1 || lv === 2 || ov === 0 || ov === 1
  })
  return (
    <div class="door-backdrop" onClick={onClose}>
      <div
        class="door-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="door-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="door-sheet-head">
          <h3 class="door-sheet-title" id="door-sheet-title">{t('status.doors')}</h3>
          <button class="door-sheet-x" onClick={onClose} aria-label={t('common.close')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {rows.length ? (
          <div class="door-grid">
            <span class="door-col-lbl" />
            <span class="door-col-lbl">{t('status.lock')}</span>
            <span class="door-col-lbl">{t('status.opening')}</span>
            {rows.map((k) => {
              const lc = lockChip(doors?.[k])
              const oc = openChip(open?.[k])
              return [
                <span class="door-name" key={`${k}-n`}>{t('status.door_' + k)}</span>,
                <span class={'door-chip ' + lc.cls} key={`${k}-l`}>{lc.label}</span>,
                <span class={'door-chip ' + oc.cls} key={`${k}-o`}>{oc.label}</span>,
              ]
            })}
          </div>
        ) : (
          <p class="door-note">{t('status.no_door_data')}</p>
        )}
      </div>
    </div>
  )
}
