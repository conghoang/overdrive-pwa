import { AppHeader } from '../components/AppHeader'
import { ChargingStats } from '../components/ChargingStats'
import { TripStats } from '../components/TripStats'
import { connected } from '../lib/store'
import { t } from '../lib/i18n'

/**
 * History and statistics, as opposed to the live state the other tabs show.
 *
 * The cards here read the car's own recorded history rather than the telemetry
 * poll, so they fetch on mount and on demand instead of every 5 seconds.
 */
export function Data() {
  return (
    <div class="screen">
      <AppHeader
        title={t('tab.data')}
        sub={connected.value ? t('common.live') : t('common.reconnecting')}
        dot={connected.value ? 'ok' : 'wait'}
      />
      <ChargingStats />
      {/* Renders nothing when trip recording is off — see TripStats. */}
      <TripStats />
    </div>
  )
}
