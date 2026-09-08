import type { JSX } from 'preact'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import { connected, refresh } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { IconBolt, IconLock, IconTrunk, IconUnlock } from './icons'

// 51DK commands (same as the WiCarlink buttons): fire an intent at the app.
const WC_ACTIVITY = 'com.wicarlink.digitalcarkey/.ui.activity.LauncherActivity'
const wc = (cmd: string) => `am start -n ${WC_ACTIVITY} --es cmd ${cmd}`

async function fire(cmd: string, ok: string) {
  try {
    toastResult(await api.fireShell(wc(cmd)), ok)
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      toast('Enable "Advanced actions" in OverDrive → Key Mapping', 'err')
    } else {
      toast(e instanceof Error ? e.message : 'Failed', 'err')
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
    <button class="quick-btn" disabled={disabled} onClick={onClick}>
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
      <QuickBtn icon={<IconLock size={22} />} label="Lock" disabled={disabled} onClick={() => fire('lock', 'Locked')} />
      <QuickBtn
        icon={<IconUnlock size={22} />}
        label="Unlock"
        disabled={disabled}
        onClick={() => fire('unlock', 'Unlocked')}
      />
      <QuickBtn
        icon={<IconBolt size={22} />}
        label="Start"
        disabled={disabled}
        onClick={() => fire('start', 'Start / Stop')}
      />
      <QuickBtn
        icon={<IconTrunk size={22} />}
        label="Trunk"
        disabled={disabled}
        onClick={() => fire('trunk', 'Trunk')}
      />
    </div>
  )
}
