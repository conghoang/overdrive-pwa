import { useState } from 'preact/hooks'
import { getBaseUrl, isValidAccessCode, login, normalizeBase } from '../lib/api'
import { t } from '../lib/i18n'
import { IconArrow, IconRefresh } from '../components/icons'
import './setup.css'

export function Setup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState(getBaseUrl())
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <img class="setup-logo" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" />
      <h1>{t('setup.title')}</h1>
      <p class="lede">{t('setup.lede')}</p>

      <form onSubmit={submit}>
        <div class="field">
          <label for="url">{t('setup.car_url')}</label>
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
    </div>
  )
}
