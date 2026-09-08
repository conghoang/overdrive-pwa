import { useState } from 'preact/hooks'
import * as api from '../lib/api'
import { connected, refresh, vehicleState } from '../lib/store'
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
import { WiCarlinkControls } from '../components/WiCarlinkControls'
import '../components/controls.css'

const TEMP_MIN = 16
const TEMP_MAX = 30
const CAP_MIN = 50
const CAP_MAX = 100

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
  // WiCarlink mode replaces the default vehicle controls with 51DK commands.
  if (wicarlink.value) return <WiCarlinkControls />

  const vs = vehicleState.value
  const climateActive = !!(vs?.climate?.acOn || vs?.climate?.remoteClimateActive)

  const [temp, setTemp] = useState(22)
  const [cap, setCap] = useState(80)
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

      {/* remote actions */}
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

      {/* charge limit */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="spread">
          <div class="card-title" style={{ margin: 0 }}>Charge limit</div>
          <span class="mono" style={{ fontSize: '20px', fontWeight: 700 }}>{cap}%</span>
        </div>
        <input
          class="slider"
          style={{ marginTop: '16px', ['--fill' as string]: `${((cap - CAP_MIN) / (CAP_MAX - CAP_MIN)) * 100}%` }}
          type="range"
          min={CAP_MIN}
          max={CAP_MAX}
          step={5}
          value={cap}
          onInput={(e) => setCap(parseInt((e.target as HTMLInputElement).value, 10))}
        />
        <button
          class="btn accent block"
          style={{ marginTop: '16px' }}
          disabled={disabled}
          onClick={() => run(() => api.setChargeCap(cap), `Charge limit set to ${cap}%`)}
        >
          Apply limit
        </button>
      </div>
    </div>
  )
}
