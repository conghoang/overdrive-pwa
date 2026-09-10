import { useEffect, useState } from 'preact/hooks'
import * as api from '../lib/api'
import { t } from '../lib/i18n'
import { IconPlug } from './icons'
import {
  buildWindow,
  dayKey,
  fmtDuration,
  fmtMoney,
  StatChartCard,
  windowLabel,
} from './StatChartCard'
import type { ChargingOverview, ChargingSession } from '../lib/types'

/*
 * One window, deliberately.
 *
 * A longer history belongs in OverDrive's own charging page, which already has
 * the filters, the per-session drill-in and tariff editing. This card is the
 * glance; the chip is the way through to the full thing rather than a second,
 * worse history browser.
 */
const DAYS = 7

function fmtKwh(v: number): string {
  return v >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, '')
}

/** Newest first — the list is not guaranteed ordered. */
function latest(sessions: ChargingSession[] | undefined): ChargingSession | null {
  if (!sessions?.length) return null
  return [...sessions].sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0))[0]
}

export function ChargingStats() {
  const [data, setData] = useState<ChargingOverview | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let live = true
    api
      .getChargingOverview(DAYS)
      .then((d) => { if (live) { setData(d); setState('ready') } })
      .catch(() => { if (live) setState('error') })
    return () => { live = false }
  }, [])

  // Per-day rows, keyed the same way the window is.
  const byDay = new Map<number, number>()
  const costByDay = new Map<number, number>()
  const sessByDay = new Map<number, number>()
  let anyEstimated = false
  for (const d of data?.summary?.daily ?? []) {
    if (typeof d.day !== 'number') continue
    const k = dayKey(d.day)
    byDay.set(k, d.energy ?? 0)
    costByDay.set(k, d.cost ?? 0)
    sessByDay.set(k, d.sessions ?? 0)
    if ((d.estimated ?? 0) > 0) anyEstimated = true
  }
  const bars = buildWindow(DAYS, byDay)

  /*
   * Totals are summed from the days actually drawn, not taken from the car's
   * period figures.
   *
   * The car's window is a rolling days*24h measured from now, so it reaches
   * back into a partial extra calendar day — a 7-day request really covered
   * eight dates here, and its periodEnergyKwh counted a session the seven bars
   * had nowhere to show. The header then read 21.4 kWh over four sessions above
   * a chart containing three. Summing what is on screen makes the headline and
   * the bars the same claim.
   */
  const totalKwh = bars.reduce((a, b) => a + b.value, 0)
  const totalCost = bars.reduce((a, b) => a + (costByDay.get(b.key) ?? 0), 0)
  const sessionCount = bars.reduce((a, b) => a + (sessByDay.get(b.key) ?? 0), 0)

  const last = latest(data?.sessions)
  const currency = last?.currency || '₫'
  /*
   * Charging energy is usually inferred from state of charge rather than
   * metered, and the car says which. An inferred total is worth showing — it is
   * the only number available — but not worth presenting as measured.
   */
  const estimated = anyEstimated || (data?.summary?.periodEstimatedSessions ?? 0) > 0

  const base = api.getBaseUrl()
  const odUrl = /^https?:\/\//i.test(base) ? `${base}/charging.html` : null

  return (
    <StatChartCard
      icon={<IconPlug size={20} />}
      title={t('data.charging')}
      subtitle={windowLabel(DAYS)}
      chipLabel={`${DAYS}D`}
      href={odUrl}
      hrefLabel={t('data.open_history')}
      state={state}
      emptyText={t('data.unavailable')}
      bars={bars}
      unit="kWh"
      formatValue={fmtKwh}
      approx={estimated}
      totals={
        <>
          <span class="cs-kwh">{fmtKwh(totalKwh)}</span>
          <span class="cs-kwh-unit">kWh</span>
          <span class="cs-sessions">
            <b>{sessionCount}</b> {t('data.sessions', { n: sessionCount })}
          </span>
          {totalCost > 0 && (
            <>
              <span class="cs-div" />
              <span class="cs-cost">
                {estimated ? '≈ ' : ''}
                {fmtMoney(totalCost, currency)}
              </span>
            </>
          )}
        </>
      }
      footer={
        last ? (
          <div class="cs-last">
            <span class="cs-last-k">{t('data.last_charge')}</span>
            <span class="cs-soc">
              <b>{last.startSoc ?? '--'}%</b>
              <i>→</i>
              <b>{last.endSoc ?? '--'}%</b>
            </span>
            {/* One unit, so a narrow phone wraps the pair onto the next line
                together rather than leaving the badge stranded alone. */}
            <span class="cs-last-right">
              <span class="cs-last-meta">
                {estimated ? '≈ ' : ''}{fmtKwh(last.energyAdded ?? 0)} kWh
                {last.durationMinutes ? ` · ${fmtDuration(last.durationMinutes)}` : ''}
              </span>
              <span class={'cs-flag ' + (last.inProgress ? 'live' : 'done')}>
                {last.inProgress ? t('data.charging_now') : t('data.completed')}
              </span>
            </span>
          </div>
        ) : null
      }
    />
  )
}
