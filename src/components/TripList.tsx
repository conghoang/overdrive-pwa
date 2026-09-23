import * as api from '../lib/api'
import { t } from '../lib/i18n'
import { fmtDec } from '../lib/format'
import { tripView, setTripView, type TripView } from '../lib/settings'
import { HistoryList } from './HistoryList'
import { TripCard } from './TripCard'

const fmtKm = (v: number) => (v >= 100 ? String(Math.round(v)) : fmtDec(v, 1))

const VIEWS: { id: TripView; label: string }[] = [
  { id: 'compact', label: 'trip.view_compact' },
  { id: 'standard', label: 'trip.view_standard' },
]

/** Compact/standard density switch — same pill styling as the 7D/30D filter. */
function ViewToggle() {
  const cur = tripView.value
  return (
    <div class="tl-filter" role="tablist" aria-label={t('trip.view_standard')}>
      {VIEWS.map((v) => (
        <button key={v.id} type="button" role="tab" aria-selected={cur === v.id}
          class={cur === v.id ? 'active' : ''} onClick={() => setTripView(v.id)}>{t(v.label)}</button>
      ))}
    </div>
  )
}

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
      toolbar={<ViewToggle />}
      daySummary={(items) => {
        const km = items.reduce((a, b) => a + (b.distanceKm ?? 0), 0)
        return <><b>{fmtKm(km)}</b> km</>
      }}
    />
  )
}
