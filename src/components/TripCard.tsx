import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import type { TripRow } from '../lib/types'
import { lang, t } from '../lib/i18n'
import { fmtDec, fmtOdo } from '../lib/format'
import { fmtDuration, fmtMoney } from './StatChartCard'
import { IconBolt, IconFuel } from './icons'

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

const Chevron = () => (
  <svg class="trip-caret" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
)

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
