import type { JSX } from 'preact'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import { connected, refresh } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { t } from '../lib/i18n'
import { tapFeedback } from '../lib/haptics'
import { IconBolt, IconLock, IconTrunk, IconUnlock } from './icons'

// 51DK commands (same as the WiCarlink buttons): fire an intent at the app.
const WC_ACTIVITY = 'com.wicarlink.digitalcarkey/.ui.activity.LauncherActivity'
const wc = (cmd: string) => `am start -n ${WC_ACTIVITY} --es cmd ${cmd}`

async function fire(cmd: string, ok: string) {
  try {
    toastResult(await api.fireShell(wc(cmd)), ok)
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      toast(t('wc.advanced_hint'), 'err')
    } else {
      toast(e instanceof Error ? e.message : t('common.failed'), 'err')
    }
  } finally {
    refresh()
  }
}

function QuickBtn({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: JSX.Element
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button class="quick-btn" disabled={disabled} onClick={() => { tapFeedback(); onClick() }}>
      <span class="quick-icon">{icon}</span>
      <span class="quick-label">{label}</span>
    </button>
  )
}

/** Row of 4 common 51DK actions, shown under the car image on the Device page. */
export function QuickActions() {
  const disabled = !connected.value
  return (
    <div class="quick-row">
      <QuickBtn icon={<IconLock size={22} />} label={t('ctrl.lock')} disabled={disabled} onClick={() => fire('lock', t('ctrl.lock'))} />
      <QuickBtn
        icon={<IconUnlock size={22} />}
        label={t('ctrl.unlock')}
        disabled={disabled}
        onClick={() => fire('unlock', t('ctrl.unlock'))}
      />
      <QuickBtn
        icon={<IconBolt size={22} />}
        label={t('ctrl.start')}
        disabled={disabled}
        onClick={() => fire('start', t('ctrl.start'))}
      />
      <QuickBtn
        icon={<IconTrunk size={22} />}
        label={t('ctrl.trunk')}
        disabled={disabled}
        onClick={() => fire('trunk', t('ctrl.trunk'))}
      />
    </div>
  )
}
