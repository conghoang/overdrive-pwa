import { clearAll, getBaseUrl, getDeviceId } from '../lib/api'
import { connected, reset, status } from '../lib/store'
import { IconPower, IconRefresh } from '../components/icons'
import * as store from '../lib/store'
import { useState } from 'preact/hooks'
import { AppHeader } from '../components/AppHeader'
import { Switch } from '../components/Switch'
import { WiCarlinkEditor } from '../components/WiCarlinkControls'
import { carPhoto, setCarPhoto, setWicarlink, wicarlink } from '../lib/settings'
import { fileToResizedDataUrl } from '../lib/image'
import { toast } from '../lib/toast'
import { lang, setLang, t } from '../lib/i18n'

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
    } catch (err) {
      const quota = err instanceof Error && /quota/i.test(err.name + err.message)
      toast(quota ? t('account.photo_big') : t('account.photo_err'), 'err')
    }
  }

  return (
    <div>
      <AppHeader title={t('tab.device')} sub={connected.value ? t('common.connected') : t('common.offline')} dot={connected.value ? 'ok' : 'bad'} />

      {/* car photo (setting) */}
      <div class="card">
        <div class="card-title">{t('dev.car_photo')}</div>
        <img
          class="car-photo-preview"
          src={carPhoto.value || `${import.meta.env.BASE_URL}car/sealion6.png`}
          alt="Car"
        />
        <div class="grid grid-2" style={{ marginTop: '12px' }}>
          <label class="btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {t('dev.change_photo')}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} />
          </label>
          <button class="btn" disabled={!carPhoto.value} onClick={() => setCarPhoto(null)}>
            {t('dev.use_default')}
          </button>
        </div>
      </div>

      {/* language */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="spread">
          <div class="card-title" style={{ margin: 0 }}>{t('dev.language')}</div>
          <div class="seg">
            <button class={lang.value === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
            <button class={lang.value === 'vi' ? 'on' : ''} onClick={() => setLang('vi')}>Tiếng Việt</button>
          </div>
        </div>
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">{t('dev.connection')}</div>
        <InfoRow label={t('dev.car_url')} value={getBaseUrl()} mono />
        <InfoRow label={t('dev.device')} value={s?.deviceId || getDeviceId() || '--'} mono />
        <InfoRow label={t('dev.app_version')} value={s?.appVersion || '--'} />
        <InfoRow label={t('dev.build')} value={__COMMIT__} mono />
        <InfoRow label={t('dev.units')} value={(s?.distanceUnit || 'km').toUpperCase()} />
        <InfoRow label={t('dev.locale')} value={s?.locale || '--'} />
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">{t('dev.integrations')}</div>
        <div class="srow">
          <div class="stack">
            <span class="srow-label">{t('dev.wicarlink')}</span>
            <span class="screen-sub" style={{ marginTop: '2px' }}>{t('dev.wicarlink_desc')}</span>
          </div>
          <Switch on={wicarlink.value} onChange={setWicarlink} />
        </div>
        {wicarlink.value && (
          <button class="btn ghost wc-edit-link" onClick={() => setEditWc(true)}>
            {t('dev.edit_51dk')}
          </button>
        )}
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <button class="btn block" onClick={() => store.refresh()}>
          <IconRefresh size={18} /> {t('dev.refresh')}
        </button>
        <button class="btn block danger" style={{ marginTop: '10px' }} onClick={signOut}>
          <IconPower size={18} /> {t('dev.sign_out')}
        </button>
      </div>

      <p class="screen-sub" style={{ textAlign: 'center', marginTop: '18px' }}>{t('dev.footer')}</p>
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
