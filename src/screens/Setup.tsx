import { useEffect, useRef, useState } from 'preact/hooks'
import { getBaseUrl, isValidAccessCode, login, normalizeBase } from '../lib/api'
import { t } from '../lib/i18n'
import { QrScanner, qrSupported, urlFromScan } from '../lib/qr'
import { IconArrow, IconQr, IconRefresh } from '../components/icons-extra'
import './setup.css'

export function Setup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState(getBaseUrl())
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
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
      .start(video)
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
