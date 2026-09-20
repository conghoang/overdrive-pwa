import { useState } from 'preact/hooks'
import type { TripRow } from '../lib/types'
import { lang, t } from '../lib/i18n'
import { fmtDec, fmtOdo } from '../lib/format'
import { fmtDuration, fmtMoney } from './StatChartCard'
import { IconBolt, IconFuel } from './icons'
import { IconNext } from './icons-extra'

const loc = () => (lang.value === 'vi' ? 'vi-VN' : 'en-US')
const per100 = (used?: number, km?: number) =>
  typeof used === 'number' && typeof km === 'number' && km > 0 ? (used / km) * 100 : null

function whenLabel(ts?: number): { date: string; time: string } {
  if (typeof ts !== 'number') return { date: '--', time: '' }
  const d = new Date(ts)
  return {
    date: d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }),
  }
}
const pct = (v?: number) => (typeof v === 'number' ? `${fmtDec(v, 0)}%` : '--')

/** One trip: a tight summary that expands (animated) to the full detail. */
export function TripCard({ trip }: { trip: TripRow }) {
  const [open, setOpen] = useState(false)
  const { date, time } = whenLabel(trip.startTime)
  const km = trip.distanceKm
  const elec = per100(trip.energyUsedKwh, km)
  const fuel = per100(trip.litresUsed, km)
  const hasDetail =
    trip.odometerStartKm != null || trip.socStart != null || trip.fuelPctStart != null || !!trip.tripCost

  const detailRow = (k: string, v: string) => (
    <div class="td-row"><span class="td-k">{k}</span><span class="td-v mono">{v}</span></div>
  )
  // A start → end % row with a coloured delta (drain/burn = orange, gain = green).
  const deltaRow = (k: string, start?: number, end?: number) => {
    const d = typeof start === 'number' && typeof end === 'number' ? end - start : null
    return (
      <div class="td-row">
        <span class="td-k">{k}</span>
        <span class="td-v mono">
          {pct(start)} → {pct(end)}
          {d != null && (
            <em class={'td-delta' + (d > 0 ? ' up' : d < 0 ? ' down' : '')}> ({d > 0 ? '+' : ''}{fmtDec(d, 0)}%)</em>
          )}
        </span>
      </div>
    )
  }

  const summary = (
    <>
      <div class="trip-when">
        <span class="trip-date">{date}</span>
        <span class="trip-time">{time}</span>
      </div>
      <div class="trip-right">
        <div class="trip-dist mono"><b>{fmtDec(km, km != null && km >= 100 ? 0 : 1)}</b> km</div>
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
        <span class="trip-caret"><IconNext size={16} /></span>
      </button>
      <div class="trip-detail-wrap">
        <div class="trip-detail">
          {trip.odometerStartKm != null &&
            detailRow(t('trip.odometer'), `${fmtOdo(trip.odometerStartKm)} → ${fmtOdo(trip.odometerEndKm)} km`)}
          {trip.socStart != null && deltaRow(t('trip.battery'), trip.socStart, trip.socEnd)}
          {trip.fuelPctStart != null && deltaRow(t('trip.fuel'), trip.fuelPctStart, trip.fuelPctEnd)}
          {typeof trip.energyUsedKwh === 'number' && trip.energyUsedKwh > 0 &&
            detailRow(t('trip.energy_used'), `${fmtDec(trip.energyUsedKwh, 1)} kWh`)}
          {typeof trip.litresUsed === 'number' && trip.litresUsed > 0 &&
            detailRow(t('trip.fuel_used'), `${fmtDec(trip.litresUsed, 1)} L`)}
          {trip.tripCost ? detailRow(t('trip.cost'), fmtMoney(trip.tripCost, trip.currency || '₫')) : null}
        </div>
      </div>
    </div>
  )
}
