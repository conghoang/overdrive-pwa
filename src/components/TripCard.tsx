import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import type { TripRow } from '../lib/types'
import { lang, t } from '../lib/i18n'
import { fmtDec, fmtOdo } from '../lib/format'
import { tripView } from '../lib/settings'
import { fmtDuration, fmtMoney } from './StatChartCard'
import { IconBattery, IconBolt, IconFuel, IconGauge, IconRoad } from './icons'

const loc = () => (lang.value === 'vi' ? 'vi-VN' : 'en-US')
const per100 = (used?: number, km?: number) =>
  typeof used === 'number' && typeof km === 'number' && km > 0 ? (used / km) * 100 : null
const clampPct = (v?: number) => Math.max(0, Math.min(100, typeof v === 'number' ? v : 0))
const pct = (v?: number) => (typeof v === 'number' ? `${fmtDec(v, 0)}%` : '--')

function whenLabel(ts?: number): { date: string; time: string } {
  if (typeof ts !== 'number') return { date: '--', time: '' }
  const d = new Date(ts)
  return {
    date: d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }),
  }
}

/** Full date with weekday, matching OverDrive's trip screen (e.g. "CN, 20/09/2026"). */
function fullDate(ts?: number): string {
  if (typeof ts !== 'number') return '--'
  return new Date(ts).toLocaleDateString(loc(), {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

/** Duration as HH:MM (45 min → "00:45"), the way the native trip card shows it. */
function hhmm(seconds?: number): string {
  if (typeof seconds !== 'number' || seconds <= 0) return '--'
  const total = Math.round(seconds / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const Chevron = () => (
  <svg class="trip-caret" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
)

// Line icons the standard card needs that aren't in the shared set.
const line = (path: JSX.Element) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{path}</svg>
)
const IconCal = () => line(<><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>)
const IconClock = () => line(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>)
const IconCan = () => line(<><path d="M5 8h9v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" /><path d="M14 11h3a2 2 0 0 1 2 2v4.5a1.6 1.6 0 0 1-3.2 0V16" /><path d="M7.5 8V6.2A1.2 1.2 0 0 1 8.7 5h1.6" /></>)
const IconMoney = () => line(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>)

/** One labelled stat: icon, caption, value (with optional absolute, unit, delta). */
function Stat(props: {
  icon: JSX.Element; label: string; value: JSX.Element
  sub?: string; unit?: string; delta?: number | null; full?: boolean
}): JSX.Element {
  const { icon, label, value, sub, unit, delta, full } = props
  return (
    <div class={'tripc-cell' + (full ? ' full' : '')}>
      <div class="tripc-cap">
        <span class="tripc-ico">{icon}</span>
        <span class="tripc-lbl">{label}</span>
      </div>
      <div class="tripc-val">
        {value}
        {sub && <small class="tripc-abs"> {sub}</small>}
        {delta != null && (
          <small class="tripc-delta"> ({delta > 0 ? '+' : ''}{fmtDec(delta, Number.isInteger(delta) ? 0 : 1)}%)</small>
        )}
        {unit && <small class="tripc-unit">{unit}</small>}
      </div>
    </div>
  )
}

/** The fully-expanded, labelled card (OverDrive-style) for the "standard" view. */
function StandardCard({ trip }: { trip: TripRow }): JSX.Element {
  const km = trip.distanceKm
  const elec = per100(trip.energyUsedKwh, km)
  const fuel = per100(trip.litresUsed, km)
  const kwh = trip.energyUsedKwh
  const litres = trip.litresUsed
  const socDelta =
    typeof trip.socStart === 'number' && typeof trip.socEnd === 'number' ? trip.socEnd - trip.socStart : null
  const fuelDelta =
    typeof trip.fuelPctStart === 'number' && typeof trip.fuelPctEnd === 'number' ? trip.fuelPctEnd - trip.fuelPctStart : null

  return (
    <div class="tripc">
      <div class="tripc-head">
        <span class="tripc-ico cal"><IconCal /></span>
        <div class="tripc-when">
          <div class="tripc-date">{fullDate(trip.startTime)}</div>
          <div class="tripc-time">{whenLabel(trip.startTime).time}</div>
        </div>
        <div class="tripc-dist mono"><b>{fmtDec(km, km != null && km >= 100 ? 0 : 1)}</b> <small>km</small></div>
      </div>

      {/* Flat 2-col flow: duration | EV, avg speed | fuel — no orphaned cell. */}
      <div class="tripc-top">
        <Stat icon={<IconClock />} label={t('trip.duration')} value={<span class="mono">{hhmm(trip.durationSeconds)}</span>} />
        {elec != null && (
          <Stat icon={<IconBolt size={17} />} label={t('trip.consumption')}
            value={<span class="mono">{fmtDec(elec, 1)}</span>} unit="kWh/100km"
            sub={typeof kwh === 'number' ? `(${fmtDec(kwh, 1)} kWh)` : undefined} />
        )}
        {trip.avgSpeedKmh != null && (
          <Stat icon={<IconGauge size={17} />} label={t('trip.avg_speed_full')}
            value={<span class="mono">{Math.round(trip.avgSpeedKmh)}</span>} unit="km/h" />
        )}
        {fuel != null && fuel > 0 && (
          <Stat icon={<IconFuel size={17} />} label={t('trip.consumption')}
            value={<span class="mono">{fmtDec(fuel, 1)}</span>} unit="L/100km"
            sub={typeof litres === 'number' ? `(${fmtDec(litres, 1)} L)` : undefined} />
        )}
      </div>

      {(trip.odometerStartKm != null || trip.socStart != null || trip.fuelPctStart != null || !!trip.tripCost) && (
        <div class="tripc-pairs">
          {trip.odometerStartKm != null && (
            <>
              <Stat icon={<IconRoad size={17} />} label={t('trip.km_start')} value={<span class="mono">{fmtOdo(trip.odometerStartKm)} km</span>} />
              <Stat icon={<IconRoad size={17} />} label={t('trip.km_end')} value={<span class="mono">{fmtOdo(trip.odometerEndKm)} km</span>} />
            </>
          )}
          {trip.socStart != null && (
            <>
              <Stat icon={<IconBattery size={17} />} label={t('trip.batt_start')} value={<span class="mono">{pct(trip.socStart)}</span>} />
              <Stat icon={<IconBattery size={17} />} label={t('trip.batt_end')} value={<span class="mono">{pct(trip.socEnd)}</span>} delta={socDelta} />
            </>
          )}
          {trip.fuelPctStart != null && (
            <>
              <Stat icon={<IconCan />} label={t('trip.fuel_start')} value={<span class="mono">{pct(trip.fuelPctStart)}</span>} />
              <Stat icon={<IconCan />} label={t('trip.fuel_end')} value={<span class="mono">{pct(trip.fuelPctEnd)}</span>} delta={fuelDelta} />
            </>
          )}
          {trip.tripCost ? (
            <Stat full icon={<IconMoney />} label={t('trip.cost')}
              value={<span class="mono">{fmtMoney(trip.tripCost, trip.currency || '₫')}</span>} />
          ) : null}
        </div>
      )}
    </div>
  )
}

/** One trip: a tight summary that expands (animated) to labelled stat cells. */
export function TripCard({ trip }: { trip: TripRow }) {
  const [open, setOpen] = useState(false)
  const { time } = whenLabel(trip.startTime)
  const km = trip.distanceKm
  const elec = per100(trip.energyUsedKwh, km)
  const fuel = per100(trip.litresUsed, km)
  const socDelta =
    typeof trip.socStart === 'number' && typeof trip.socEnd === 'number' ? trip.socEnd - trip.socStart : null
  const kwh = trip.energyUsedKwh
  const litres = trip.litresUsed
  const hasDetail =
    trip.odometerStartKm != null || trip.socStart != null ||
    (typeof kwh === 'number' && kwh > 0) || (typeof litres === 'number' && litres > 0) || !!trip.tripCost

  if (tripView.value === 'standard') return <StandardCard trip={trip} />

  const cell = (label: string, value: JSX.Element, full = false) => (
    <div class={'tstat' + (full ? ' full' : '')}>
      <div class="tstat-k">{label}</div>
      <div class="tstat-v mono">{value}</div>
    </div>
  )

  const summary = (
    <>
      <div class="trip-when">
        <span class="trip-date">{time}</span>
      </div>
      <div class="trip-right">
        <div class="trip-dist mono"><b>{fmtDec(km, km != null && km >= 100 ? 0 : 1)}</b><small>km</small></div>
        <div class="trip-sub">
          {trip.durationSeconds ? fmtDuration(trip.durationSeconds / 60) : ''}
          {trip.avgSpeedKmh != null ? ` · ${Math.round(trip.avgSpeedKmh)} km/h` : ''}
        </div>
      </div>
      <div class="trip-chips">
        {elec != null && <span class="tchip"><IconBolt size={13} /> {fmtDec(elec, 1)}<i>kWh/100</i></span>}
        {fuel != null && fuel > 0 && <span class="tchip"><IconFuel size={13} /> {fmtDec(fuel, 1)}<i>L/100</i></span>}
      </div>
    </>
  )

  if (!hasDetail) return <div class="trip"><div class="trip-main">{summary}</div></div>

  return (
    <div class={'trip' + (open ? ' open' : '')}>
      <button class="trip-main" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {summary}
        <span class="trip-chev"><Chevron /></span>
      </button>
      <div class="trip-detail-wrap">
        <div class="trip-detail">
          {trip.odometerStartKm != null &&
            cell(t('trip.odometer'), <>{fmtOdo(trip.odometerStartKm)} <span class="tarrow">→</span> {fmtOdo(trip.odometerEndKm)} <span class="tu">km</span></>)}
          {trip.socStart != null && (
            <div class="tstat">
              <div class="tstat-k">{t('trip.battery')}</div>
              <div class="tstat-v mono">
                {pct(trip.socStart)} <span class="tarrow">→</span> {pct(trip.socEnd)}
                {socDelta != null && (
                  <em class={'tdelta' + (socDelta > 0 ? ' up' : socDelta < 0 ? ' down' : ' flat')}> {socDelta > 0 ? '+' : ''}{fmtDec(socDelta, 0)}%</em>
                )}
              </div>
              <div class="tbar"><i class="from" style={{ width: `${clampPct(trip.socStart)}%` }} /><i class="to" style={{ width: `${clampPct(trip.socEnd)}%` }} /></div>
            </div>
          )}
          {typeof kwh === 'number' && kwh > 0 &&
            cell(t('trip.energy_used'), <>{fmtDec(kwh, 1)} <span class="tu">kWh</span></>)}
          {typeof litres === 'number' && litres > 0 &&
            cell(t('trip.fuel_used'), <>{fmtDec(litres, 1)} <span class="tu">L</span></>)}
          {trip.tripCost ? cell(t('trip.cost'), <>{fmtMoney(trip.tripCost, trip.currency || '₫')}</>) : null}
        </div>
      </div>
    </div>
  )
}
