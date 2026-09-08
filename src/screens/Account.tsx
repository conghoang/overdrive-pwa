import { clearAll, getBaseUrl, getDeviceId } from '../lib/api'
import { connected, reset, status } from '../lib/store'
import { IconPower, IconRefresh } from '../components/icons'
import * as store from '../lib/store'
import { useState } from 'preact/hooks'
import { AppHeader } from '../components/AppHeader'
import { Switch } from '../components/Switch'
import { CarHero } from '../components/CarHero'
import { EnergyGauges } from '../components/EnergyGauges'
import { WiCarlinkEditor } from '../components/WiCarlinkControls'
import { carPhoto, setCarPhoto, setWicarlink, wicarlink } from '../lib/settings'
import { fileToResizedDataUrl } from '../lib/image'
import { toast } from '../lib/toast'

export function Account({ onSignOut }: { onSignOut: () => void }) {
  const s = status.value
  const [editWc, setEditWc] = useState(false)

  if (editWc) return <WiCarlinkEditor onDone={() => setEditWc(false)} />

  function signOut() {
    reset()
    clearAll()
    onSignOut()
  }

  async function pickPhoto(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      setCarPhoto(await fileToResizedDataUrl(file, 1100))
    } catch {
      toast('Could not load that image', 'err')
    }
  }

  return (
    <div>
      <AppHeader title="Device" sub={connected.value ? 'Connected' : 'Offline'} dot={connected.value ? 'ok' : 'bad'} />

      {/* car hero + energy */}
      {s ? (
        <>
          <CarHero s={s} />
          <div style={{ marginTop: '14px' }}>
            <EnergyGauges s={s} />
          </div>
        </>
      ) : (
        <div class="card"><div class="center-note">Connecting…</div></div>
      )}

      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">Car photo</div>
        <div class="grid grid-2">
          <label class="btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            Change photo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} />
          </label>
          <button class="btn" disabled={!carPhoto.value} onClick={() => setCarPhoto(null)}>
            Use default
          </button>
        </div>
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">Connection</div>
        <InfoRow label="Car URL" value={getBaseUrl()} mono />
        <InfoRow label="Device" value={s?.deviceId || getDeviceId() || '--'} mono />
        <InfoRow label="App version" value={s?.appVersion || '--'} />
        <InfoRow label="Build" value={__COMMIT__} mono />
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
        {wicarlink.value && (
          <button class="btn ghost wc-edit-link" onClick={() => setEditWc(true)}>
            Edit 51DK buttons
          </button>
        )}
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
