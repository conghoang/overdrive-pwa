import { clearAll, getBaseUrl, getDeviceId } from '../lib/api'
import { connected, reset, status } from '../lib/store'
import { IconPower, IconRefresh } from '../components/icons'
import * as store from '../lib/store'
import { Switch } from '../components/Switch'
import { setWicarlink, wicarlink } from '../lib/settings'

export function Account({ onSignOut }: { onSignOut: () => void }) {
  const s = status.value

  function signOut() {
    reset()
    clearAll()
    onSignOut()
  }

  return (
    <div>
      <div class="screen-head">
        <div>
          <h1 class="screen-title">Account</h1>
          <div class="screen-sub">{connected.value ? 'Connected' : 'Offline'}</div>
        </div>
        <span class={'dot ' + (connected.value ? 'ok' : 'bad')} />
      </div>

      <div class="card">
        <div class="card-title">Connection</div>
        <InfoRow label="Car URL" value={getBaseUrl()} mono />
        <InfoRow label="Device" value={s?.deviceId || getDeviceId() || '--'} mono />
        <InfoRow label="App version" value={s?.appVersion || '--'} />
        <InfoRow label="Units" value={(s?.distanceUnit || 'km').toUpperCase()} />
        <InfoRow label="Locale" value={s?.locale || '--'} />
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">Integrations</div>
        <div class="srow">
          <div class="stack">
            <span class="srow-label">WiCarlink kit (51DK)</span>
            <span class="screen-sub" style={{ marginTop: '2px' }}>
              Replace vehicle controls with 51DK commands
            </span>
          </div>
          <Switch on={wicarlink.value} onChange={setWicarlink} />
        </div>
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <button class="btn block" onClick={() => store.refresh()}>
          <IconRefresh size={18} /> Refresh now
        </button>
        <button class="btn block danger" style={{ marginTop: '10px' }} onClick={signOut}>
          <IconPower size={18} /> Sign out
        </button>
      </div>

      <p class="screen-sub" style={{ textAlign: 'center', marginTop: '18px' }}>
        OverDrive PWA · unofficial companion
      </p>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div class="srow">
      <span class="srow-label" style={{ color: 'var(--muted)' }}>{label}</span>
      <span class={mono ? 'mono' : ''} style={{ maxWidth: '62%', textAlign: 'right', overflowWrap: 'anywhere' }}>
        {value}
      </span>
    </div>
  )
}
