import { CLOUD_DEFAULT_URL, clearAll, cloudState, disableCloud, enrollCloud, removeCloudFromCar, getBaseUrl, getCloudEnrollment, getCloudUrl, getDeviceId, refreshCloud, setCloudUrl, setCloudOnly, cloudOnly } from '../lib/api'
import type { CloudEnrollment } from '../lib/api'
import { connected, dataSource, reset, status } from '../lib/store'
import { hardReset } from '../lib/updater'
import { ago } from '../lib/format'
import { IconCloud, IconInfo, IconPower, IconRefresh } from '../components/icons-extra'
import { useEffect, useState } from 'preact/hooks'
import { AppHeader } from '../components/AppHeader'
import { DEFAULT_PHOTO } from '../components/CarHero'
import { Switch } from '../components/Switch'
import { lazyScreen } from '../lib/lazy'
// The custom-cloud confirm uses the shared modal styles, which live there.
import '../components/controls.css'

/*
 * The 51DK editor is a whole second screen — drag-reorder, icon picker, two
 * modals — reached from one button in Settings. Loading it on demand keeps it
 * out of the app shell for everyone who never opens it.
 */
const WiCarlinkEditor = lazyScreen(() => import('../components/WiCarlinkEditor'), 'WiCarlinkEditor')

import { car3dColor, carName, carPhoto, holdStart, holdTrunk, resetSettings, setCar3dColor, setCarName, setCarPhoto, setHoldStart, setHoldTrunk, setShow3d, setShowMap, setWicarlink, show3d, showMap, wicarlink } from '../lib/settings'

// A few realistic paint options plus a free picker for anything else.
const CAR3D_SWATCHES = [
  ['#E8E8EC', 'White'], ['#C7CBCE', 'Silver'], ['#6E747A', 'Grey'],
  ['#17181B', 'Black'], ['#9B1D2E', 'Red'], ['#1E3C6E', 'Blue'], ['#2E5B4F', 'Green'],
] as const
import { fileToResizedBlob } from '../lib/image'
import { toast } from '../lib/toast'
import { lang, setLang, t } from '../lib/i18n'
import { rt } from '../lib/rich'
import { hapticsEnabled, hapticsSupported, setHapticsEnabled, tapFeedback } from '../lib/haptics'
import { setSoundEnabled, soundEnabled, soundSupported, tapSound, unlockAudio } from '../lib/sound'
export function Account({ onSignOut }: { onSignOut: () => void }) {
  const s = status.value
  const [editWc, setEditWc] = useState(false)
  const [haptics, setHaptics] = useState(hapticsEnabled())
  const [sound, setSound] = useState(soundEnabled())

  if (editWc) return <WiCarlinkEditor onDone={() => setEditWc(false)} />

  function signOut() {
    reset()
    clearAll()
    resetSettings() // storage is only half of it; the signals hold the photo too
    onSignOut()
  }

  async function pickPhoto(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      await setCarPhoto(await fileToResizedBlob(file))
    } catch (err) {
      const quota = err instanceof Error && /quota/i.test(err.name + err.message)
      toast(quota ? t('account.photo_big') : t('account.photo_err'), 'err')
    }
  }

  return (
    <div class="screen">
      <AppHeader title={t('tab.device')} sub={connected.value ? t('common.connected') : t('common.offline')} dot={connected.value ? 'ok' : 'bad'} />

      {/* car photo (setting) */}
      <div class="card">
        <div class="card-title">{t('dev.car_photo')}</div>
        {/* Decorative: the card title above already says what this is, so an
            alt would only repeat it — and "Car" was English in a Vietnamese UI. */}
        <img
          class="car-photo-preview"
          src={carPhoto.value || DEFAULT_PHOTO}
          alt=""
        />
        <div class="grid grid-2" style={{ marginTop: '12px' }}>
          <label class="btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {t('dev.change_photo')}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} />
          </label>
          <button class="btn" disabled={!carPhoto.value} onClick={() => void setCarPhoto(null)}>
            {t('dev.use_default')}
          </button>
        </div>
      </div>

      {/* vehicle name */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">{t('dev.car_name')}</div>
        <input
          class="wc-input"
          maxLength={28}
          placeholder={t('dev.car_name_ph')}
          value={carName.value}
          onInput={(e) => setCarName((e.target as HTMLInputElement).value)}
        />
        <div class="screen-sub" style={{ marginTop: '8px' }}>{t('dev.car_name_desc')}</div>
      </div>

      {/* map */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="srow" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div class="stack">
            <span class="srow-label">{t('dev.map')}</span>
            <span class="screen-sub" style={{ marginTop: '2px' }}>{rt('dev.map_desc')}</span>
          </div>
          <Switch on={showMap.value} onChange={setShowMap} />
        </div>
      </div>

      {/* 3D car model in the hero (vs the still photo) */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="srow" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div class="stack">
            <span class="srow-label">{t('dev.model3d')}</span>
            <span class="screen-sub" style={{ marginTop: '2px' }}>{rt('dev.model3d_desc')}</span>
          </div>
          <Switch on={show3d.value} onChange={setShow3d} />
        </div>

        {show3d.value && (
          <div class="srow" style={{ paddingBottom: 0, borderTop: '1px solid var(--line)', marginTop: '12px', paddingTop: '12px' }}>
            <div class="stack">
              <span class="srow-label">{t('dev.model3d_color')}</span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
                {CAR3D_SWATCHES.map(([hex, name]) => (
                  <button
                    key={hex}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={car3dColor.value.toLowerCase() === hex.toLowerCase()}
                    onClick={() => setCar3dColor(hex)}
                    style={{
                      width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer',
                      background: hex,
                      border: car3dColor.value.toLowerCase() === hex.toLowerCase()
                        ? '2px solid var(--accent)' : '1px solid var(--line2)',
                      boxShadow: car3dColor.value.toLowerCase() === hex.toLowerCase() ? '0 0 0 2px var(--bg)' : 'none',
                    }}
                  />
                ))}
                {/* Free picker for any other colour. */}
                <label
                  title={t('dev.model3d_color_custom')}
                  style={{
                    width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', overflow: 'hidden',
                    border: '1px dashed var(--line2)', display: 'inline-grid', placeItems: 'center', position: 'relative',
                  }}
                >
                  <span style={{ fontSize: '15px', lineHeight: 1 }}>🎨</span>
                  <input
                    type="color"
                    value={car3dColor.value}
                    onInput={(e) => setCar3dColor((e.target as HTMLInputElement).value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* language */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="spread">
          <div class="card-title" style={{ margin: 0 }}>{t('dev.language')}</div>
          {/* Which language is active was signalled by text colour alone. */}
          <div class="seg" role="radiogroup" aria-label={t('dev.language')}>
            <button role="radio" aria-checked={lang.value === 'en'} class={lang.value === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
            <button role="radio" aria-checked={lang.value === 'vi'} class={lang.value === 'vi' ? 'on' : ''} onClick={() => setLang('vi')}>Tiếng Việt</button>
          </div>
        </div>
      </div>

      {(hapticsSupported() || soundSupported()) && (
        <div class="card" style={{ marginTop: '14px' }}>
          {hapticsSupported() && (
          <div class="srow" style={{ paddingTop: 0 }}>
            <div class="stack">
              <span class="srow-label">{t('dev.haptics')}</span>
              <span class="screen-sub" style={{ marginTop: '2px' }}>{t('dev.haptics_desc')}</span>
            </div>
            <Switch
              on={haptics}
              onChange={(v) => {
                setHapticsEnabled(v)
                setHaptics(v)
                if (v) tapFeedback() // let them feel it immediately
              }}
            />
          </div>
          )}
          {soundSupported() && (
            <div class="srow">
              <div class="stack">
                <span class="srow-label">{t('dev.sound')}</span>
                <span class="screen-sub" style={{ marginTop: '2px' }}>{t('dev.sound_desc')}</span>
              </div>
              <Switch
                on={sound}
                onChange={(v) => {
                  setSoundEnabled(v)
                  setSound(v)
                  if (v) {
                    unlockAudio() // open the output while we still have the gesture
                    tapSound() // and demo it
                  }
                }}
              />
            </div>
          )}
        </div>
      )}

      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">{t('dev.connection')}</div>
        <InfoRow label={t('dev.car_url')} value={getBaseUrl()} mono />
        <InfoRow label={t('dev.device')} value={s?.deviceId || getDeviceId() || '--'} mono />
        <InfoRow label={t('dev.app_version')} value={s?.appVersion || '--'} />
        <InfoRow label={t('dev.build')} value={__COMMIT__} mono />
        <InfoRow label={t('dev.units')} value={(s?.distanceUnit || 'km').toUpperCase()} />
        <InfoRow label={t('dev.locale')} value={s?.locale || '--'} />
      </div>

      <CloudBackup />

      {/* Press-and-hold guards for the actions a stray tap shouldn't fire. */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">{t('dev.hold_title')}</div>
        <div class="screen-sub" style={{ marginTop: '-4px' }}>{rt('dev.hold_desc')}</div>
        <div class="srow">
          <span class="srow-label">{t('dev.hold_trunk')}</span>
          <Switch on={holdTrunk.value} onChange={setHoldTrunk} />
        </div>
        <div class="srow" style={{ paddingBottom: 0 }}>
          <span class="srow-label">{t('dev.hold_start')}</span>
          <Switch on={holdStart.value} onChange={setHoldStart} />
        </div>
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">{t('dev.integrations')}</div>
        <div class="srow">
          <div class="stack">
            <span class="srow-label">{t('dev.wicarlink')}</span>
            <span class="screen-sub" style={{ marginTop: '2px' }}>{rt('dev.wicarlink_desc')}</span>
          </div>
          <Switch on={wicarlink.value} onChange={setWicarlink} />
        </div>
        {wicarlink.value && (
          <button class="btn ghost wc-edit-link" onClick={() => setEditWc(true)}>
            {t('dev.edit_51dk')}
          </button>
        )}
        <div class="srow" style={{ paddingBottom: 0 }}>
          <div class="stack">
            <span class="srow-label">{t('dev.pair_watch')}</span>
            <span class="screen-sub" style={{ marginTop: '2px' }}>{t('dev.pair_watch_desc')}</span>
          </div>
          <button class="btn ghost" onClick={() => { location.href = import.meta.env.BASE_URL + 'pair/' }}>
            {t('dev.pair_open')}
          </button>
        </div>
        <PairHowTo />
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        {/* Clears every cache + the service worker and reloads fresh — the escape
            hatch when the app is stuck on a stale build. Keeps the car URL and
            sign-in (those live in localStorage, which this does not touch). */}
        <button class="btn block" onClick={() => { void hardReset() }}>
          <IconRefresh size={18} /> {t('dev.refresh')}
        </button>
        <p class="screen-sub" style={{ margin: '6px 2px 0', fontSize: '12px' }}>{rt('dev.refresh_desc')}</p>
        <button class="btn block danger" style={{ marginTop: '12px' }} onClick={signOut}>
          <IconPower size={18} /> {t('dev.sign_out')}
        </button>
      </div>

      <p class="screen-sub" style={{ textAlign: 'center', marginTop: '18px' }}>{t('dev.footer')}</p>
    </div>
  )
}

/** The short address a user types into the watch browser to reach the watch app. */
const WATCH_ADDR = 'w.sl6vn.link'

function PairHowTo() {
  // Step 1 carries the address; split on the placeholder so it can be emphasised.
  const [before, after] = t('dev.pair_step1', { addr: '\u0000' }).split('\u0000')
  const [b3, a3] = t('dev.pair_step3', { icon: '\u0000' }).split('\u0000')
  return (
    <div class="pair-howto">
      <div class="pair-howto-title">{t('dev.pair_how')}</div>
      <ol>
        <li>{before}<span class="pair-addr mono">{WATCH_ADDR}</span>{after}</li>
        <li>{rt('dev.pair_step2')}</li>
        <li>
          {b3}
          {/* Same glyph as the watch's check button, so it's recognisable there. */}
          <svg class="pair-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-label="refresh">
            <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8" /><path d="M21 3v5h-5" />
          </svg>
          {a3}
        </li>
      </ol>
    </div>
  )
}

/*
 * SL6VN Cloud backup. Entirely optional: never enabled, every request goes to the
 * car URL exactly as before. Enabled, it is used on its own whenever the car
 * URL stops answering (see lib/fallback.ts) — there is no switch to flip, which
 * is the point of a backup. Enabling is one tap: the cloud is handed the car
 * URL and session this app already has, and nothing is typed.
 */
function CloudBackup() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feed, setFeed] = useState<CloudEnrollment | null>(null)
  const [url, setUrl] = useState(getCloudUrl())
  // A non-default cloud is about to receive the tunnel JWT: ask first.
  const [confirming, setConfirming] = useState(false)
  // Turning off asks whether to also remove the car-side setup.
  const [explaining, setExplaining] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const state = cloudState.value
  const viaCloud = dataSource.value === 'cloud'
  // Enrolling goes THROUGH the tunnel, so it needs the tunnel answering now.
  const tunnelUp = connected.value && dataSource.value === 'tunnel'

  // Whether the car is reachable via the cloud right now — a nice-to-have.
  useEffect(() => {
    if (state !== 'on') { setFeed(null); return }
    let live = true
    void getCloudEnrollment().then((e) => { if (live) setFeed(e) }).catch(() => {})
    return () => { live = false }
  }, [state])

  async function enable(confirmed = false) {
    if (busy || !tunnelUp) return
    if (!confirmed && getCloudUrl() !== CLOUD_DEFAULT_URL) { setConfirming(true); return }
    setConfirming(false)
    setBusy(true)
    setError(null)
    try {
      // A lost session usually only needs a new token, which is one quick
      // exchange — the full enrolment reconfigures the car and takes a minute.
      if (!(state === 'lost' && (await refreshCloud()))) await enrollCloud()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failed'))
    } finally {
      setBusy(false)
    }
  }

  function askDisable() {
    setRemoveError(null)
    setDisabling(true)
  }
  function turnOff() {
    setDisabling(false)
    disableCloud()
  }
  async function turnOffAndRemove() {
    if (removing) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await removeCloudFromCar()
      turnOff()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : t('cloud.remove_failed'))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div class="card" style={{ marginTop: '14px' }}>
      <div class="spread" style={{ marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <div class="card-title" style={{ margin: 0 }}>{t('cloud.title')}</div>
          <button class="info-btn" onClick={() => setExplaining(true)} title={t('cloud.how')} aria-label={t('cloud.how')}>
            <IconInfo size={17} />
          </button>
        </div>
      </div>
      {state === 'on' ? (
        <>
          <div class="screen-sub">{rt('cloud.desc')}</div>
          {/* One line: is the car reachable through the cloud, and how fresh is it. */}
          <div class="screen-sub" style={{ marginTop: '8px' }}>
            {!feed ? '--'
              : feed.online ? `${t('common.connected')}${feed.updatedAt ? ` · ${ago(feed.updatedAt)}` : ''}`
              : `${t('common.offline')}${feed.updatedAt ? ` · ${ago(feed.updatedAt)}` : ''}`}
          </div>
          {/* Only worth showing when it isn't ours: a custom cloud holds the car session. */}
          {getCloudUrl() !== CLOUD_DEFAULT_URL && (
            <div class="cloud-off-hint mono">{getCloudUrl().replace(/^https:\/\//, '')}</div>
          )}
          <div class="srow" style={{ paddingBottom: 0 }}>
            <div class="stack">
              <span class="srow-label">{t('cloud.only')}</span>
              <span class="screen-sub" style={{ marginTop: '2px' }}>{rt('cloud.only_desc')}</span>
            </div>
            <Switch on={cloudOnly.value} onChange={setCloudOnly} />
          </div>
          {/* Turn off on the left, the state at the bottom right. */}
          <div class="spread" style={{ marginTop: '4px' }}>
            <button class="btn ghost" onClick={askDisable}>
              {t('cloud.disable')}
            </button>
            {viaCloud
              ? <span class="pill warn pill-icon" title={t('cloud.in_use')} aria-label={t('cloud.in_use')} role="img"><IconCloud size={16} /></span>
              : <span class="pill good">{t('common.on')}</span>}
          </div>
        </>
      ) : (
        <>
          <div class="screen-sub">{rt('cloud.desc')}</div>
          <button class="btn accent block" style={{ marginTop: '12px' }} disabled={busy || !tunnelUp} onClick={() => void enable()}>
            {busy ? <><IconRefresh size={18} class="spin" /> {t('cloud.enabling')}</> : t('cloud.enable')}
          </button>
          {busy && <div class="cloud-off-hint">{rt('cloud.enabling_hint')}</div>}
          {!busy && !tunnelUp && <div class="cloud-off-hint">{rt('cloud.enable_needs_tunnel')}</div>}
          {error && <div class="screen-sub" style={{ marginTop: '8px', color: 'var(--danger)' }}>{error}</div>}
          {/* Which cloud to enrol with. Almost nobody needs this, so it stays folded. */}
          <details class="cloud-adv">
            <summary>{t('cloud.advanced')}</summary>
            <input
              class="wc-input mono"
              type="url"
              inputMode="url"
              autocomplete="off"
              aria-label={t('cloud.url')}
              placeholder={CLOUD_DEFAULT_URL}
              value={url === CLOUD_DEFAULT_URL ? '' : url}
              onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
              onBlur={(e) => {
                const ok = setCloudUrl((e.target as HTMLInputElement).value)
                setError(ok ? null : t('cloud.url_invalid'))
                if (ok) setUrl(getCloudUrl())
              }}
            />
          </details>
          {state === 'lost' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <span class="pill warn">{t('cloud.needs_reenable')}</span>
            </div>
          )}
        </>
      )}

      {state !== 'on' && cloudOnly.value && (
        <div class="srow" style={{ paddingBottom: 0 }}>
          <div class="stack">
            <span class="srow-label">{t('cloud.only')}</span>
            <span class="screen-sub" style={{ marginTop: '2px' }}>{rt('cloud.only_desc')}</span>
          </div>
          <Switch on={cloudOnly.value} onChange={setCloudOnly} />
        </div>
      )}

      {explaining && (
        <div class="modal-backdrop" onClick={() => setExplaining(false)}>
          <div
            class="modal cloud-how"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-how-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="modal-title" id="cloud-how-title">{t('cloud.how_title')}</h3>
            {(['data', 'ctrl', 'when', 'off', 'setup'] as const).map((k) => (
              <section key={k}>
                <h4>{t(`cloud.how_${k}_h`)}</h4>
                <p>{rt(`cloud.how_${k}`)}</p>
                {k === 'ctrl' && <p>{rt('cloud.how_ctrl_list')}</p>}
              </section>
            ))}
            <button class="btn block" style={{ marginTop: '16px' }} onClick={() => setExplaining(false)}>OK</button>
          </div>
        </div>
      )}

      {disabling && (
        <div class="modal-backdrop" onClick={() => { if (!removing) setDisabling(false) }}>
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-disable-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="modal-title" id="cloud-disable-title">{t('cloud.disable_title')}</h3>
            <p class="modal-body">{rt('cloud.disable_body')}</p>
            <button class="btn danger block" disabled={removing || (!tunnelUp && !cloudOnly.value)} onClick={() => void turnOffAndRemove()}>
              {removing ? <><IconRefresh size={18} class="spin" /> {t('cloud.removing')}</> : t('cloud.disable_remove')}
            </button>
            {!removing && !tunnelUp && !cloudOnly.value && <div class="cloud-off-hint">{rt('cloud.remove_needs_tunnel')}</div>}
            {removeError && <div class="screen-sub" style={{ marginTop: '8px', color: 'var(--danger)' }}>{removeError}</div>}
            <div class="grid grid-2" style={{ marginTop: '10px' }}>
              <button class="btn" disabled={removing} onClick={() => setDisabling(false)}>{t('wc.cancel')}</button>
              <button class="btn" disabled={removing} onClick={turnOff}>{t('cloud.disable_keep')}</button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div class="modal-backdrop" onClick={() => setConfirming(false)}>
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="modal-title" id="cloud-confirm-title">{t('cloud.confirm_title')}</h3>
            <p class="modal-body">{rt('cloud.confirm_custom', { url: getCloudUrl() })}</p>
            <div class="grid grid-2">
              <button class="btn" onClick={() => setConfirming(false)}>{t('wc.cancel')}</button>
              <button class="btn accent" onClick={() => void enable(true)}>{t('cloud.enable')}</button>
            </div>
          </div>
        </div>
      )}
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
