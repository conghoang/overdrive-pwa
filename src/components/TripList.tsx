import * as api from '../lib/api'
import { t } from '../lib/i18n'
import { fmtDec } from '../lib/format'
import { HistoryList } from './HistoryList'
import { TripCard } from './TripCard'

const fmtKm = (v: number) => (v >= 100 ? String(Math.round(v)) : fmtDec(v, 1))

/** Trip history, grouped by day with per-day distance subtotals. */
export function TripList({ onBack }: { onBack: () => void }) {
  return (
    <HistoryList
      title={t('trip.title')}
      onBack={onBack}
      load={(d) => api.getTrips(d)}
      startTimeOf={(x) => x.startTime}
      renderRow={(x) => <TripCard key={x.id ?? x.startTime} trip={x} />}
      countLabel={(n) => `${n} ${t('data.trips_n', { n })}`}
      emptyText={t('trip.empty')}
      daySummary={(items) => {
        const km = items.reduce((a, b) => a + (b.distanceKm ?? 0), 0)
        return <><b>{fmtKm(km)}</b> km</>
      }}
    />
  )
}
