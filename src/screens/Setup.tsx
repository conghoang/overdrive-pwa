import { useEffect, useRef, useState } from 'preact/hooks'
import { getBaseUrl, isValidAccessCode, login, normalizeBase } from '../lib/api'
import { t } from '../lib/i18n'
import { QrScanner, qrSupported, urlFromScan, listCameras } from '../lib/qr'
import { IconArrow, IconQr, IconRefresh } from '../components/icons-extra'
import './setup.css'

export function Setup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState(getBaseUrl())
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  // Camera switching: `cameras` is the list to cycle through (filled once the
  // camera is live); `activeDeviceRef` tracks which one is currently open.
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const activeDeviceRef = useRef<string | undefined>(undefined)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const canScan = qrSupported()

  // Escape closes the scanner — the Cancel button was the only way out.
  useEffect(() => {
    if (!scanning) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setScanning(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [scanning])

  // Run the scanner while the overlay is open; always tear the camera down.
  useEffect(() => {
    if (!scanning) return
    const video = videoRef.current
    if (!video) return
    const scanner = new QrScanner()
    scannerRef.current = scanner
    let cancelled = false
    scanner
      .start(video, {
        onStart: (active) => {
          activeDeviceRef.current = active
          // Now that the camera is live, labels are available — list cameras so
          // we know whether to offer a switch.
          listCameras().then((c) => { if (!cancelled) setCameras(c) })
        },
      })
      .then((raw) => {
        if (cancelled) return
        const found = urlFromScan(raw)
        setScanning(false)
        if (found) {
          setUrl(found)
          setError(null)
        } else {
          setError(t('setup.scan_failed'))
        }
      })
      .catch((e) => {
        if (cancelled) return
        setScanning(false)
        const denied = e instanceof Error && /denied|NotAllowed/i.test(e.name + e.message)
        setError(denied ? t('setup.scan_denied') : t('setup.scan_failed'))
      })
    return () => {
      cancelled = true
      scanner.stop()
      scannerRef.current = null
    }
  }, [scanning])

  /** Cycle to the next camera in place — no restart, no re-prompt, no flash. */
  function switchCamera() {
    if (cameras.length < 2) return
    let i = cameras.findIndex((c) => c.deviceId === activeDeviceRef.current)
    if (i < 0) i = 0
    const next = cameras[(i + 1) % cameras.length]
    activeDeviceRef.current = next.deviceId
    scannerRef.current?.switchCamera(next.deviceId).catch(() => {})
  }

  const code = token.trim()
  const codeValid = isValidAccessCode(code)
  const codeError = code.length > 0 && !codeValid

  async function submit(e: Event) {
    e.preventDefault()
    if (busy || !url || !codeValid) return
    setBusy(true)
    setError(null)
    try {
      await login(url, token)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup.login_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="setup">
      <img class="setup-logo" src={`${import.meta.env.BASE_URL}icons/logo-tile.webp`} alt="" />
      <h1>{t('setup.title')}</h1>
      <p class="lede">{t('setup.lede')}</p>

      <form onSubmit={submit}>
        <div class="field">
          <label for="url">{t('setup.car_url')}</label>
          <div class="url-row">
            <input
              id="url"
              type="url"
              inputMode="url"
              autocomplete="url"
              placeholder="https://my-car.trycloudflare.com"
              value={url}
              onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
              onBlur={(e) => {
                const v = (e.target as HTMLInputElement).value.trim()
                if (v) setUrl(normalizeBase(v)) // auto-trim to just the domain
              }}
            />
            {canScan && (
              <button
                type="button"
                class="scan-btn"
                aria-label={t('setup.scan')}
                title={t('setup.scan')}
                onClick={() => {
                  setError(null)
                  setCameras([]) // re-listed once the camera is live
                  setScanning(true)
                }}
              >
                <IconQr size={22} />
              </button>
            )}
          </div>
          <div class="hint">{t('setup.car_url_hint')}</div>
        </div>

        <div class="field">
          <label for="token">{t('setup.access_code')}</label>
          <input
            id="token"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            maxLength={8}
            placeholder="xxxxxxxx"
            class={codeError ? 'error' : undefined}
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          />
          {codeError ? (
            <div class="hint" style={{ color: 'var(--danger)' }}>{t('setup.code_len')}</div>
          ) : (
            <div class="hint">{t('setup.access_code_hint')}</div>
          )}
        </div>

        {error && <div class="setup-error">{error}</div>}

        <button class="btn accent block" type="submit" disabled={busy || !url || !codeValid}>
          {busy ? (
            <>
              <IconRefresh size={18} class="spin" /> {t('setup.connecting')}
            </>
          ) : (
            <>
              {t('setup.connect')} <IconArrow size={18} />
            </>
          )}
        </button>
      </form>

      {/* An opaque fixed overlay that was a plain div: it covered the form
          without announcing itself, and the form underneath stayed in the tab
          order, so keyboard focus walked invisible fields behind it. */}
      {scanning && (
        <div class="scan-overlay" role="dialog" aria-modal="true" aria-labelledby="scan-title">
          <div class="scan-box">
            <video ref={videoRef} class="scan-video" muted playsinline />
            <div class="scan-frame" />
            {cameras.length > 1 && (
              <button
                type="button"
                class="scan-switch"
                aria-label={t('setup.switch_camera')}
                title={t('setup.switch_camera')}
                onClick={switchCamera}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 4h3a2 2 0 0 1 2 2v3" />
                  <path d="M9 20H6a2 2 0 0 1-2-2v-3" />
                  <path d="M20 9a8 8 0 0 0-14-3M4 15a8 8 0 0 0 14 3" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              </button>
            )}
          </div>
          <h3 class="scan-title" id="scan-title">{t('setup.scan_title')}</h3>
          <p class="scan-hint">{t('setup.scan_hint')}</p>
          <button class="btn block" onClick={() => setScanning(false)}>
            {t('setup.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
