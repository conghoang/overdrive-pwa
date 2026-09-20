import * as api from '../lib/api'
import { t } from '../lib/i18n'
import { fmtDec } from '../lib/format'
import { HistoryList } from './HistoryList'
import { ChargingSessionCard } from './ChargingSessionCard'

/** Charging history, grouped by day with per-day energy subtotals. */
export function ChargingList({ onBack }: { onBack: () => void }) {
  return (
    <HistoryList
      title={t('charge.title')}
      onBack={onBack}
      load={(d) => api.getChargingOverview(d).then((o) => o.sessions ?? [])}
      startTimeOf={(x) => x.startTime}
      renderRow={(x) => <ChargingSessionCard key={x.id ?? x.startTime} s={x} />}
      countLabel={(n) => `${n} ${t('data.sessions', { n })}`}
      emptyText={t('charge.empty')}
      daySummary={(items) => {
        const kwh = items.reduce((a, b) => a + (b.energyAdded ?? 0), 0)
        return <><b>{fmtDec(kwh, 1)}</b> kWh</>
      }}
    />
  )
}
