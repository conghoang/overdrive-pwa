import { useEffect, useState } from 'preact/hooks'
import * as api from '../lib/api'
import { t } from '../lib/i18n'
import { IconCar } from './icons-extra'
import {
  buildWindow,
  dayKey,
  fmtDuration,
  fmtMoney,
  StatChartCard,
  windowLabel,
} from './StatChartCard'
import type { TripConfig, TripRow } from '../lib/types'
import { num, readCache, writeCache } from '../lib/cache'

const CACHE_KEY = 'odpwa.data.trips'

/*
 * Only the fields this card reads. A week of trips carries start/end
 * coordinates, elevation profiles, SoC and per-trip scores — none of it drawn
 * here, and on a busy week that is a lot of quota for nothing.
 */
function trim(list: TripRow[]): TripRow[] {
  return list.map((x) => ({
    startTime: x.startTime, distanceKm: x.distanceKm, durationSeconds: x.durationSeconds,
    avgSpeedKmh: x.avgSpeedKmh, energyUsedKwh: x.energyUsedKwh, energyMetered: x.energyMetered,
    tripCost: x.tripCost, currency: x.currency,
  }))
}

function revive(raw: unknown): TripRow[] | null {
  if (!Array.isArray(raw)) return null
  // Every row is bucketed by startTime and summed by distance, so both have to
  // be real numbers before any of it reaches the chart.
  const ok = raw.every((x) => x && typeof x === 'object' && num((x as TripRow).startTime) != null)
  return ok ? (raw as TripRow[]) : null
}

const DAYS = 7

function fmtKm(v: number): string {
  return v >= 100 ? String(Math.round(v)) : v.toFixed(1)
}

export function TripStats() {
  const [cfg, setCfg] = useState<TripConfig | null>(null)
  // Seeded from the last visit, so the card opens on real distances.
  const [trips, setTrips] = useState<TripRow[] | null>(() => readCache(CACHE_KEY, revive))
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(
    () => (readCache(CACHE_KEY, revive) ? 'ready' : 'loading'),
  )

  useEffect(() => {
    let live = true
    Promise.all([api.getTripConfig(), api.getTrips(DAYS)])
      .then(([c, list]) => {
        if (!live) return
        setCfg(c)
        setTrips(list)
        setState('ready')
        // Recording off means the stored rows are stale by definition, so stop
        // remembering them rather than opening on them next time.
        if (c?.config?.enabled === false) localStorage.removeItem(CACHE_KEY)
        else writeCache(CACHE_KEY, trim(list))
      })
      .catch(() => { if (live) setState((cur) => (cur === 'ready' ? cur : 'error')) })
    return () => { live = false }
  }, [])

  /*
   * Trip recording is a setting the owner can turn off, and with it off the
   * rows that survive are whatever was logged before it stopped — arbitrarily
   * old, and presented under "last 7 days" they would be a plain lie. The card
   * is not rendered at all rather than shown empty, which would read as "you
   * drove nowhere this week".
   *
   * Only an explicit false hides it: a build that omits the flag, or an
   * unreachable config call, should keep working. Same rule getOdometer uses.
   */
  if (cfg?.config?.enabled === false) return null
  // Nothing recorded and nothing configured — no card rather than an empty one.
  if (state === 'ready' && !trips?.length) return null

  const inWindow = trips ?? []
  const kmByDay = new Map<number, number>()
  const costByDay = new Map<number, number>()
  const countByDay = new Map<number, number>()
  for (const tr of inWindow) {
    if (typeof tr.startTime !== 'number') continue
    const k = dayKey(tr.startTime)
    kmByDay.set(k, (kmByDay.get(k) ?? 0) + (tr.distanceKm ?? 0))
    costByDay.set(k, (costByDay.get(k) ?? 0) + (tr.tripCost ?? 0))
    countByDay.set(k, (countByDay.get(k) ?? 0) + 1)
  }
  const bars = buildWindow(DAYS, kmByDay)

  // Totals summed from the days drawn, so the headline and the bars agree —
  // the trip list can reach back further than the seven columns can show.
  const totalKm = bars.reduce((a, b) => a + b.value, 0)
  const tripCount = bars.reduce((a, b) => a + (countByDay.get(b.key) ?? 0), 0)
  const totalCost = bars.reduce((a, b) => a + (costByDay.get(b.key) ?? 0), 0)

  const last = [...inWindow].sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0))[0] ?? null
  const currency = last?.currency || cfg?.config?.currency || '₫'
  /*
   * Unlike charging, trip energy is usually really metered — the car says so
   * per trip. Only mark it approximate when it is not.
   */
  const metered = last?.energyMetered !== false

  const base = api.getBaseUrl()
  const odUrl = /^https?:\/\//i.test(base) ? `${base}/trips.html` : null

  return (
    <StatChartCard
      icon={<IconCar size={20} />}
      title={t('data.trips')}
      subtitle={windowLabel(DAYS)}
      chipLabel={`${DAYS}D`}
      href={odUrl}
      hrefLabel={t('data.open_trips')}
      state={state}
      emptyText={t('data.no_trips')}
      bars={bars}
      unit="km"
      formatValue={fmtKm}
      totals={
        <>
          <span class="cs-kwh">{fmtKm(totalKm)}</span>
          <span class="cs-kwh-unit">km</span>
          <span class="cs-sessions">
            <b>{tripCount}</b> {t('data.trips_n', { n: tripCount })}
          </span>
          {totalCost > 0 && (
            <>
              <span class="cs-div" />
              <span class="cs-cost">{fmtMoney(totalCost, currency)}</span>
            </>
          )}
        </>
      }
      footer={
        last ? (
          <div class="cs-last">
            <span class="cs-last-k">{t('data.last_trip')}</span>
            <span class="cs-soc">
              <b>{fmtKm(last.distanceKm ?? 0)}</b>
              <i>km</i>
            </span>
            <span class="cs-last-right">
              <span class="cs-last-meta">
                {last.durationSeconds ? fmtDuration(last.durationSeconds / 60) : ''}
                {last.avgSpeedKmh != null ? ` · ${Math.round(last.avgSpeedKmh)} km/h` : ''}
              </span>
              {last.energyUsedKwh != null && (
                <span class="cs-flag done">
                  {metered ? '' : '≈ '}
                  {last.energyUsedKwh.toFixed(1)} kWh
                </span>
              )}
            </span>
          </div>
        ) : null
      }
    />
  )
}
