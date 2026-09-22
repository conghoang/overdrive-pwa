import { useEffect, useState } from 'preact/hooks'
import { AppHeader } from '../components/AppHeader'
import { ChargingStats } from '../components/ChargingStats'
import { TripStats } from '../components/TripStats'
import { TripList } from '../components/TripList'
import { ChargingList } from '../components/ChargingList'
import { connected } from '../lib/store'
import { t } from '../lib/i18n'

/**
 * History and statistics, as opposed to the live state the other tabs show.
 *
 * The trips and charging cards each open an in-app detail list. Which sub-view
 * is open lives in the URL hash (#/data/trips, #/data/charging) so a reload —
 * most often a pull-to-refresh — restores it instead of dropping to the summary.
 */
type Sub = 'trips' | 'charging' | null
const subFromHash = (): Sub => {
  const s = location.hash.replace(/^#\/?/, '').split('/')[1]
  return s === 'trips' || s === 'charging' ? s : null
}

export function Data() {
  const [sub, setSub] = useState<Sub>(subFromHash)

  useEffect(() => {
    const onHash = () => setSub(subFromHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const openTrips = () => { setSub('trips'); history.replaceState(null, '', '#/data/trips') }
  const openCharging = () => { setSub('charging'); history.replaceState(null, '', '#/data/charging') }
  const close = () => { setSub(null); history.replaceState(null, '', '#/data') }

  if (sub === 'trips') return <TripList onBack={close} />
  if (sub === 'charging') return <ChargingList onBack={close} />

  return (
    <div class="screen">
      <AppHeader
        title={t('tab.data')}
        sub={connected.value ? t('common.live') : t('common.reconnecting')}
        dot={connected.value ? 'ok' : 'wait'}
      />
      <ChargingStats onOpenDetails={openCharging} />
      {/* Renders nothing when trip recording is off — see TripStats. */}
      <TripStats onOpenDetails={openTrips} />
    </div>
  )
}
