import { useState } from 'preact/hooks'
import { getBaseUrl, login } from '../lib/api'
import { IconArrow, IconRefresh } from '../components/icons'
import './setup.css'

export function Setup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState(getBaseUrl())
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: Event) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await login(url, token)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="setup">
      <img class="setup-logo" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" />
      <h1>Connect your car</h1>
      <p class="lede">
        Enter your OverDrive tunnel or LAN address and the 8-character access code. This is stored on
        this device only — you'll only do it once.
      </p>

      <form onSubmit={submit}>
        <div class="field">
          <label for="url">Car URL</label>
          <input
            id="url"
            type="url"
            inputMode="url"
            autocomplete="url"
            placeholder="https://my-car.trycloudflare.com"
            value={url}
            onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          />
          <div class="hint">Your cloudflared/zrok tunnel URL, or http://192.168.x.x:8080 on the same Wi-Fi.</div>
        </div>

        <div class="field">
          <label for="token">Access code</label>
          <input
            id="token"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            maxLength={8}
            placeholder="xxxxxxxx"
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          />
          <div class="hint">
            The 8-character code from OverDrive → Dashboard → Access Code (same as the web login).
            Tip: enter <code>demo</code> to preview the app with sample data.
          </div>
        </div>

        {error && <div class="setup-error">{error}</div>}

        <button class="btn accent block" type="submit" disabled={busy || !url || !token}>
          {busy ? (
            <>
              <IconRefresh size={18} class="spin" /> Connecting…
            </>
          ) : (
            <>
              Connect <IconArrow size={18} />
            </>
          )}
        </button>
      </form>
    </div>
  )
}
