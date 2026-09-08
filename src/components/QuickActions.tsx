import type { JSX } from 'preact'
import * as api from '../lib/api'
import { connected, refresh, vehicleState } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import type { ControlResult } from '../lib/types'
import { IconBell, IconLock, IconUnlock, IconWind } from './icons'

async function run(fn: () => Promise<ControlResult>, ok: string) {
  try {
    toastResult(await fn(), ok)
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Failed', 'err')
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

/** Row of 4 common remote actions, shown under the car image on the Device page. */
export function QuickActions() {
  const disabled = !connected.value
  const climateOn = !!(vehicleState.value?.climate?.acOn || vehicleState.value?.climate?.remoteClimateActive)

  return (
    <div class="quick-row">
      <QuickBtn icon={<IconLock size={22} />} label="Lock" disabled={disabled} onClick={() => run(api.lock, 'Locked')} />
      <QuickBtn
        icon={<IconUnlock size={22} />}
        label="Unlock"
        disabled={disabled}
        onClick={() => run(api.unlock, 'Unlocked')}
      />
      <QuickBtn
        icon={<IconWind size={22} />}
        label={climateOn ? 'A/C off' : 'A/C on'}
        disabled={disabled}
        onClick={() =>
          run(() => (climateOn ? api.climateOff() : api.climateOn(22)), climateOn ? 'Climate off' : 'Climate on')
        }
      />
      <QuickBtn
        icon={<IconBell size={22} />}
        label="Find"
        disabled={disabled}
        onClick={() => run(api.findCar, 'Sounding horn')}
      />
    </div>
  )
}
