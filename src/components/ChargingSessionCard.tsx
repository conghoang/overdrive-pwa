import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import type { ChargingSession } from '../lib/types'
import { lang, t } from '../lib/i18n'
import { fmtDec } from '../lib/format'
import { fmtDuration, fmtMoney } from './StatChartCard'
import { IconBattery } from './icons'

const loc = () => (lang.value === 'vi' ? 'vi-VN' : 'en-US')
const clampPct = (v?: number) => Math.max(0, Math.min(100, typeof v === 'number' ? v : 0))
const pct = (v?: number) => (typeof v === 'number' ? `${fmtDec(v, 0)}%` : '--')
const timeLabel = (ts?: number) =>
  typeof ts === 'number' ? new Date(ts).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }) : '--'

const Chevron = () => (
  <svg class="trip-caret" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
)

/** One charging session: summary that expands to labelled stat cells. */
export function ChargingSessionCard({ s }: { s: ChargingSession }) {
  const [open, setOpen] = useState(false)
  const est = s.energySource === 'soc_estimate' || s.isEstimated
  const socDelta =
    typeof s.startSoc === 'number' && typeof s.endSoc === 'number' ? s.endSoc - s.startSoc : null
  const cell = (label: string, value: JSX.Element, full = false) => (
    <div class={'tstat' + (full ? ' full' : '')}>
      <div class="tstat-k">{label}</div>
      <div class="tstat-v mono">{value}</div>
    </div>
  )

  const summary = (
    <>
      <div class="trip-when"><span class="trip-date">{timeLabel(s.startTime)}</span></div>
      <div class="trip-right">
        <div class="trip-dist mono"><b>{est ? '≈' : ''}{fmtDec(s.energyAdded, 1)}</b><small>kWh</small></div>
        <div class="trip-sub">
          {s.durationMinutes ? fmtDuration(s.durationMinutes) : ''}
          {s.isDc != null ? ` · ${s.isDc ? 'DC' : 'AC'}` : ''}
        </div>
      </div>
      <div class="trip-chips">
        {(s.startSoc != null || s.endSoc != null) && (
          <span class="tchip"><IconBattery size={13} /> {pct(s.startSoc)}<i>→</i>{pct(s.endSoc)}</span>
        )}
        {s.inProgress
          ? <span class="tchip live">{t('data.charging_now')}</span>
          : s.cost ? <span class="tchip">{est ? '≈ ' : ''}{fmtMoney(s.cost, s.currency || '₫')}</span> : null}
      </div>
    </>
  )

  return (
    <div class={'trip' + (open ? ' open' : '')}>
      <button class="trip-main" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {summary}
        <span class="trip-chev"><Chevron /></span>
      </button>
      <div class="trip-detail-wrap">
        <div class="trip-detail">
          {s.startSoc != null && (
            <div class="tstat">
              <div class="tstat-k">{t('trip.battery')}</div>
              <div class="tstat-v mono">
                {pct(s.startSoc)} <span class="tarrow">→</span> {pct(s.endSoc)}
                {socDelta != null && (
                  <em class={'tdelta' + (socDelta > 0 ? ' up' : socDelta < 0 ? ' down' : ' flat')}> {socDelta > 0 ? '+' : ''}{fmtDec(socDelta, 0)}%</em>
                )}
              </div>
              <div class="tbar"><i class="from" style={{ width: `${clampPct(s.startSoc)}%` }} /><i class="to" style={{ width: `${clampPct(s.endSoc)}%` }} /></div>
            </div>
          )}
          {(s.avgPower != null || s.peakPower != null) &&
            cell(t('charge.power'), <>{fmtDec(s.avgPower, 1)} <span class="tarrow">/</span> {fmtDec(s.peakPower, 1)} <span class="tu">kW</span></>)}
          {typeof s.rangeGained === 'number' && s.rangeGained > 0 &&
            cell(t('charge.range'), <>+{Math.round(s.rangeGained)} <span class="tu">km</span></>)}
          {s.durationMinutes ? cell(t('trip.duration'), <>{fmtDuration(s.durationMinutes)}</>) : null}
          {s.cost ? cell(t('trip.cost'), <>{est ? '≈ ' : ''}{fmtMoney(s.cost, s.currency || '₫')}</>, true) : null}
        </div>
      </div>
    </div>
  )
}
