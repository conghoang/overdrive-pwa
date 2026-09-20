import { useEffect, useState } from 'preact/hooks'
import { AppHeader } from '../components/AppHeader'
import { ChargingStats } from '../components/ChargingStats'
import { TripStats } from '../components/TripStats'
import { TripList } from '../components/TripList'
import { connected } from '../lib/store'
import { t } from '../lib/i18n'

/**
 * History and statistics, as opposed to the live state the other tabs show.
 *
 * The trips card opens an in-app detail list (TripList). That sub-view is kept
 * in the URL hash (#/data/trips) so a reload — most often a pull-to-refresh —
 * restores it instead of dropping back to the summary.
 */
const isTripsHash = () => location.hash.replace(/^#\/?/, '').split('/')[1] === 'trips'

export function Data() {
  const [showTrips, setShowTrips] = useState(isTripsHash)

  // Keep the sub-view in sync with the hash (back/forward, manual edits).
  useEffect(() => {
    const onHash = () => setShowTrips(isTripsHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const open = () => { setShowTrips(true); history.replaceState(null, '', '#/data/trips') }
  const close = () => { setShowTrips(false); history.replaceState(null, '', '#/data') }

  if (showTrips) return <TripList onBack={close} />

  return (
    <div class="screen">
      <AppHeader
        title={t('tab.data')}
        sub={connected.value ? t('common.live') : t('common.reconnecting')}
        dot={connected.value ? 'ok' : 'wait'}
      />
      <ChargingStats />
      {/* Renders nothing when trip recording is off — see TripStats. */}
      <TripStats onOpenDetails={open} />
    </div>
  )
}
