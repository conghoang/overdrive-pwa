import { useState } from 'preact/hooks'
import * as api from '../lib/api'
import { cloudConfigured, connected, refresh, vehicleState } from '../lib/store'
import { toastResult } from '../lib/toast'
import type { ControlResult } from '../lib/types'
import { ActionButton } from '../components/HoldButton'
import {
  IconBell,
  IconBolt,
  IconLock,
  IconMinus,
  IconPlus,
  IconTrunk,
  IconUnlock,
  IconWind,
} from '../components/icons'
import { wicarlink } from '../lib/settings'
import { WiCarlinkGrid } from '../components/WiCarlinkControls'
import '../components/controls.css'

const TEMP_MIN = 16
const TEMP_MAX = 30

async function run(fn: () => Promise<ControlResult>, okMsg: string) {
  try {
    const r = await fn()
    toastResult(r, okMsg)
  } catch (e) {
    toastResult({ success: false, error: e instanceof Error ? e.message : 'Failed' }, okMsg)
  } finally {
    refresh()
  }
}

export function Controls() {
  const [temp, setTemp] = useState(22)

  // WiCarlink mode swaps only the top remote-action buttons for 51DK commands.
  const wc = wicarlink.value

  const vs = vehicleState.value
  const climateActive = !!(vs?.climate?.acOn || vs?.climate?.remoteClimateActive)
  const disabled = !connected.value

  return (
    <div>
      <div class="screen-head">
        <div>
          <h1 class="screen-title">Controls</h1>
          <div class="screen-sub">{disabled ? 'Reconnecting…' : 'Ready'}</div>
        </div>
        <span class={'dot ' + (disabled ? 'wait' : 'ok')} />
      </div>

      {/* remote actions — 51DK commands in WiCarlink mode; otherwise the BYD
          Cloud buttons, hidden entirely when BYD Cloud isn't configured. */}
      {wc ? (
        <WiCarlinkGrid />
      ) : cloudConfigured.value === false ? null : (
        <div class="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <ActionButton
            label="Lock"
            tone="accent"
            icon={<IconLock size={26} />}
            disabled={disabled}
            onFire={() => run(api.lock, 'Locked')}
          />
          <ActionButton
            label="Unlock"
            tone="danger"
            hold
            icon={<IconUnlock size={26} />}
            disabled={disabled}
            onFire={() => run(api.unlock, 'Unlocked')}
          />
          <ActionButton
            label="Flash"
            icon={<IconBolt size={26} />}
            disabled={disabled}
            onFire={() => run(api.flash, 'Flashed lights')}
          />
          <ActionButton
            label="Find car"
            icon={<IconBell size={26} />}
            disabled={disabled}
            onFire={() => run(api.findCar, 'Sounding horn')}
          />
          <ActionButton
            label="Trunk"
            hold
            icon={<IconTrunk size={26} />}
            disabled={disabled}
            onFire={() => run(() => api.setTrunk('open'), 'Trunk opening')}
          />
        </div>
      )}

      {/* climate */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="spread">
          <div class="card-title" style={{ margin: 0 }}>Climate</div>
          <span class={'pill' + (climateActive ? ' good' : '')}>{climateActive ? 'On' : 'Off'}</span>
        </div>
        <div class="stepper" style={{ justifyContent: 'center', margin: '18px 0' }}>
          <button disabled={temp <= TEMP_MIN} onClick={() => setTemp((t) => Math.max(TEMP_MIN, t - 1))}>
            <IconMinus size={22} />
          </button>
          <div class="stepper-value mono">
            {temp}
            <small>°C</small>
          </div>
          <button disabled={temp >= TEMP_MAX} onClick={() => setTemp((t) => Math.min(TEMP_MAX, t + 1))}>
            <IconPlus size={22} />
          </button>
        </div>
        <div class="grid grid-2">
          <button
            class="btn accent"
            disabled={disabled}
            onClick={() => run(() => api.climateOn(temp), `Climate on · ${temp}°C`)}
          >
            <IconWind size={18} /> Start 15 min
          </button>
          <button class="btn" disabled={disabled} onClick={() => run(api.climateOff, 'Climate off')}>
            Turn off
          </button>
        </div>
      </div>

      {/* windows */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">Windows</div>
        <div class="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <button class="btn" disabled={disabled} onClick={() => run(api.ventWindows, 'Venting')}>
            Vent
          </button>
          <button class="btn" disabled={disabled} onClick={() => run(api.openAllWindows, 'Opening')}>
            Open all
          </button>
          <button class="btn" disabled={disabled} onClick={() => run(api.closeAllWindows, 'Closing')}>
            Close all
          </button>
        </div>
      </div>
    </div>
  )
}
