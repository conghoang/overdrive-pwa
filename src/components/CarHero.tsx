import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { carPhoto } from '../lib/settings'
import { vehicleState } from '../lib/store'
import { distanceUnitLabel, fmtDistance } from '../lib/format'
import { t } from '../lib/i18n'
import { anyDoorOpen, windowsOpenCount } from '../lib/vehicle'
import { tyreSeverity } from '../lib/tyres'
import { IconBattery, IconBolt, IconFuel, IconLock, IconUnlock, IconWindow } from './icons'
import type { DoorOpenState, DoorsState, StatusResponse, TyresState } from '../lib/types'

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
  const doorOpen = anyDoorOpen(vs?.doorOpen)
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
          open={vs?.doorOpen}
          tyres={vs?.tyres}
          onClose={() => setDoorSheet(false)}
        />
      )}
    </div>
  )
}

/** The six openable areas. */
const DOOR_AREAS: Array<keyof DoorOpenState> = ['lf', 'rf', 'lr', 'rr', 'trunk', 'hood']

/**
 * Per-area colour. Open wins (an ajar door is the thing to notice); otherwise
 * the area takes the OVERALL lock — this trim reports the lock only for the
 * driver door, but the whole-car lock applies to every closed door, so a closed
 * door on a locked car reads green "Locked".
 */
function areaState(openV: boolean | undefined, lockOverall: number | undefined): string {
  if (openV === true) return 'open'
  if (lockOverall === 1) return 'locked'
  if (lockOverall === 2) return 'unlocked'
  return 'unknown'
}

function areaTitle(key: string, openV: boolean | undefined, lockOverall: number | undefined): string {
  const parts: string[] = []
  if (openV === true) parts.push(t('status.open'))
  else if (openV === false) parts.push(t('status.closed'))
  if (lockOverall === 1) parts.push(t('status.locked'))
  else if (lockOverall === 2) parts.push(t('status.unlocked'))
  return `${t('status.door_' + key)} — ${parts.length ? parts.join(' · ') : t('common.unknown')}`
}

/** Bonnet/tailgate: glass keeps its normal tint, turning red only when open. */
function glassTitle(key: string, openV: boolean | undefined): string {
  const op = openV === true ? t('status.open') : openV === false ? t('status.closed') : t('common.unknown')
  return `${t('status.door_' + key)} — ${op}`
}

/**
 * Per-door breakdown behind the hero's lock pill, drawn as a top-view car
 * diagram like OverDrive's: the four doors, the bonnet (front), the tailgate
 * (rear) and the tyres. Each openable area is tinted by its open state — green
 * closed, red (pulsing) open, grey unknown — and a central padlock shows the
 * overall lock. A legend spells the colours out; a note stands in when the car
 * reports nothing at all.
 */
function DoorStatusSheet({
  doors,
  open,
  tyres,
  onClose,
}: {
  doors: DoorsState | undefined
  open: DoorOpenState | undefined
  tyres: TyresState | undefined
  onClose: () => void
}) {
  const lockOverall = doors?.overall // 1 locked, 2 unlocked, else unknown
  const st = (k: keyof DoorOpenState) => areaState(open?.[k], lockOverall)
  const title = (k: keyof DoorOpenState) => areaTitle(k, open?.[k], lockOverall)
  const hasAny = DOOR_AREAS.some((k) => st(k) !== 'unknown')
  // Wheel colour follows that corner's pressure state; "muted" (grey) when the
  // car reports no reading, so the car still looks complete without one.
  const tyre = (k: 'fl' | 'fr' | 'rl' | 'rr') =>
    tyreSeverity(tyres?.[k], k === 'fl' || k === 'fr', tyres?.limits)

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

        {hasAny ? (
          <>
            <svg class="door-car" viewBox="0 0 150 260" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('status.doors')}>
              {/* Tyres — drawn first (behind the body), coloured by pressure */}
              <rect class={'door-tyre ' + tyre('fl')} x="15" y="54" width="13" height="34" rx="5" />
              <rect class={'door-tyre ' + tyre('fr')} x="122" y="54" width="13" height="34" rx="5" />
              <rect class={'door-tyre ' + tyre('rl')} x="15" y="172" width="13" height="34" rx="5" />
              <rect class={'door-tyre ' + tyre('rr')} x="122" y="172" width="13" height="34" rx="5" />

              <path class="door-car-body" d="M75 12 C51 12 37 24 35 50 L31 92 L31 196 C31 228 47 248 75 248 C103 248 119 228 119 196 L119 92 L115 50 C113 24 99 12 75 12 Z" />
              <rect class="door-car-roof" x="46" y="98" width="58" height="96" rx="16" />

              {/* Front glass = bonnet (front); rear glass = tailgate (rear): keep the
                  glass tint, turn red only when that lid is open. */}
              <path class={'door-glass' + (open?.hood === true ? ' open' : '')} d="M48 62 C58 54 92 54 102 62 L98 88 C84 82 66 82 52 88 Z"><title>{glassTitle('hood', open?.hood)}</title></path>
              <path class={'door-glass' + (open?.trunk === true ? ' open' : '')} d="M52 202 C66 208 84 208 98 202 L102 222 C92 230 58 230 48 222 Z"><title>{glassTitle('trunk', open?.trunk)}</title></path>

              {/* Four doors — left side (LF/LR), right side (RF/RR) */}
              <rect class={'door-area ' + st('lf')} x="27" y="98" width="5" height="44" rx="2.5"><title>{title('lf')}</title></rect>
              <rect class={'door-area ' + st('lr')} x="27" y="150" width="5" height="44" rx="2.5"><title>{title('lr')}</title></rect>
              <rect class={'door-area ' + st('rf')} x="118" y="98" width="5" height="44" rx="2.5"><title>{title('rf')}</title></rect>
              <rect class={'door-area ' + st('rr')} x="118" y="150" width="5" height="44" rx="2.5"><title>{title('rr')}</title></rect>
            </svg>

            <div class="door-legend">
              <span class="door-leg"><i class="sw locked" />{t('status.locked')}</span>
              <span class="door-leg"><i class="sw unlocked" />{t('status.unlocked')}</span>
              <span class="door-leg"><i class="sw open" />{t('status.open')}</span>
              <span class="door-leg"><i class="sw unknown" />{t('common.unknown')}</span>
            </div>
          </>
        ) : (
          <p class="door-note">{t('status.no_door_data')}</p>
        )}
      </div>
    </div>
  )
}
