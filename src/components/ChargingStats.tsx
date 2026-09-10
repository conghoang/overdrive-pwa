import { useEffect, useState } from 'preact/hooks'
import * as api from '../lib/api'
import { lang, t } from '../lib/i18n'
import { IconArrow, IconPlug } from './icons'
import type { ChargingOverview, ChargingSession } from '../lib/types'
import './chargingstats.css'

/** Windows the period chip cycles through. */
const PERIODS = [7, 30] as const

/** Local midnight for a timestamp — the key the daily roll-up is bucketed by. */
function dayKey(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * One bar per day in the window, oldest first.
 *
 * The car omits days it has no sessions for rather than sending zeroes, so a
 * naive map would draw four bars for a seven-day week and silently relabel the
 * axis. The window is generated here and the car's rows are matched into it, so
 * a day with no charging is a real, visible zero.
 */
function buildBars(days: number, overview: ChargingOverview | null) {
  const byDay = new Map<number, { kwh: number; cost: number; sessions: number; estimated: number }>()
  for (const d of overview?.summary?.daily ?? []) {
    if (typeof d.day !== 'number') continue
    byDay.set(dayKey(d.day), {
      kwh: d.energy ?? 0,
      cost: d.cost ?? 0,
      sessions: d.sessions ?? 0,
      estimated: d.estimated ?? 0,
    })
  }
  const today = dayKey(Date.now())
  const out: { key: number; kwh: number; cost: number; sessions: number; estimated: number; label: string }[] = []
  const fmt = new Intl.DateTimeFormat(lang.value === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'narrow' })
  for (let i = days - 1; i >= 0; i--) {
    const key = today - i * 86_400_000
    const row = byDay.get(key)
    out.push({
      key,
      kwh: row?.kwh ?? 0,
      cost: row?.cost ?? 0,
      sessions: row?.sessions ?? 0,
      estimated: row?.estimated ?? 0,
      label: fmt.format(new Date(key)),
    })
  }
  return out
}

/**
 * A round axis top, and the gridlines to match.
 *
 * Scaling straight to the tallest bar makes every chart look identical no
 * matter how much was actually drawn — 2 kWh and 20 kWh both fill the frame.
 * Rounding up to a whole step keeps the height meaningful between periods.
 */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [4, 2, 0] }
  const raw = max / 3
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const top = step * 3
  return { top, ticks: [top, step * 2, step, 0] }
}

function fmtKwh(v: number): string {
  return v >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, '')
}

function fmtMoney(v: number, currency: string): string {
  const locale = lang.value === 'vi' ? 'vi-VN' : 'en-US'
  return `${Math.round(v).toLocaleString(locale)} ${currency}`
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** Newest session first — the list is not guaranteed ordered. */
function latest(sessions: ChargingSession[] | undefined): ChargingSession | null {
  if (!sessions?.length) return null
  return [...sessions].sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0))[0]
}

export function ChargingStats() {
  const [days, setDays] = useState<number>(PERIODS[0])
  const [data, setData] = useState<ChargingOverview | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let live = true
    setState((s) => (s === 'ready' ? s : 'loading')) // keep the old chart while re-fetching
    api
      .getChargingOverview(days)
      .then((d) => { if (live) { setData(d); setState('ready') } })
      .catch(() => { if (live) setState('error') })
    return () => { live = false }
  }, [days])

  const summary = data?.summary
  const bars = buildBars(days, data)
  const { top, ticks } = niceScale(Math.max(...bars.map((b) => b.kwh), 0))
  const last = latest(data?.sessions)
  const currency = last?.currency || '₫'
  /*
   * Every figure here can be inferred from SoC rather than metered, and the car
   * says which. An inferred total is worth showing — it is the only number
   * available — but not worth presenting as measured, so it carries a "~".
   */
  const estimated =
    bars.some((b) => b.estimated > 0) || (summary?.periodEstimatedSessions ?? 0) > 0

  /*
   * Totals are summed from the days actually drawn, not taken from the car's
   * period figures.
   *
   * The car's window is a rolling `days * 24h` measured from now, so it reaches
   * back into a partial extra calendar day — a 7-day request really covered
   * eight dates here, and its periodEnergyKwh counted a session the seven bars
   * had nowhere to show. The header then read 21.4 kWh over four sessions above
   * a chart containing three. Summing what is on screen makes the headline and
   * the bars the same claim; the cost comes from the same rows so it cannot
   * drift from the energy either.
   */
  const sessionCount = bars.reduce((a, b) => a + b.sessions, 0)
  const totalKwh = bars.reduce((a, b) => a + b.kwh, 0)
  const totalCost = bars.reduce((a, b) => a + b.cost, 0)

  return (
    <div class="card cs-card">
      <div class="cs-head">
        <span class="cs-badge"><IconPlug size={20} /></span>
        <div class="cs-titles">
          <div class="cs-title">{t('data.charging')}</div>
          <div class="cs-sub">{t('data.last_days', { n: days })}</div>
        </div>
        <button
          class="cs-period"
          onClick={() => setDays((d) => PERIODS[(PERIODS.indexOf(d as 7) + 1) % PERIODS.length])}
          aria-label={t('data.change_period')}
        >
          {days}D <IconArrow size={14} />
        </button>
      </div>

      {state === 'error' ? (
        <div class="cs-empty">{t('data.unavailable')}</div>
      ) : (
        <>
          <div class="cs-totals">
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
          </div>

          {/* Gridlines and bars share one grid so a bar's height is read against
              the same rows the axis labels name — no separate scales to drift. */}
          <div class="cs-chart">
            <div class="cs-axis" aria-hidden="true">
              {ticks.map((v) => (
                <span key={v}>{v % 1 === 0 ? v : v.toFixed(1)}</span>
              ))}
            </div>
            <div class="cs-plot">
              {ticks.map((v) => (
                <div class="cs-grid" key={v} style={{ bottom: `${(v / top) * 100}%` }} />
              ))}
              <div class="cs-bars">
                {bars.map((b, i) => (
                  <div class="cs-col" key={b.key}>
                    <div
                      class={'cs-bar' + (i === bars.length - 1 ? ' now' : '') + (b.kwh > 0 ? '' : ' zero')}
                      style={{ height: `${Math.max(b.kwh > 0 ? 2 : 0, (b.kwh / top) * 100)}%` }}
                      title={`${fmtKwh(b.kwh)} kWh`}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div class="cs-unit" aria-hidden="true">kWh</div>
            <div class="cs-labels">
              {bars.map((b) => (
                <span key={b.key}>{b.label}</span>
              ))}
            </div>
          </div>

          {last && (
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
          )}
        </>
      )}
    </div>
  )
}
