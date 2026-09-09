import { useEffect, useRef, useState } from 'preact/hooks'
import * as api from '../lib/api'
import { CAMERA_VIEWS } from '../lib/api'
import { connected, status } from '../lib/store'
import { AppHeader } from '../components/AppHeader'
import { t } from '../lib/i18n'
import { startPlayer, webCodecsSupported } from '../lib/h264'
import type { PlayerHandle, PlayerState } from '../lib/h264'
import './camera.css'

/**
 * Live camera view.
 *
 * This whole screen — decoder included — is loaded only when the tab is opened
 * (see app.tsx), so the cost never lands on someone who just wants the
 * dashboard.
 *
 * The stream is a real resource on the head unit: it wakes the encoder and
 * keeps it running. So it is enabled on entry and DISABLED on the way out,
 * including when the tab is switched away or the page is hidden — leaving it
 * running because a screen unmounted would be a battery bug on the car, not
 * just here.
 */
export function Camera() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playerRef = useRef<PlayerHandle | null>(null)
  const [view, setView] = useState<number>(CAMERA_VIEWS[0].mode)
  const [state, setState] = useState<PlayerState>('stopped')
  const [quality, setQuality] = useState<api.StreamQuality>({})
  // Bumped only when the USER picks a preset. Keying the stream effect on
  // quality.current instead would reconnect once more on entry, when the
  // initial GET resolves and fills it in for the first time.
  const [restartAt, setRestartAt] = useState(0)
  const [detail, setDetail] = useState<string | null>(null)
  const supported = webCodecsSupported()
  const base = api.getBaseUrl()
  const isDemo = !/^https?:\/\//i.test(base)

  // Presets are read from the car rather than hardcoded, so they cannot drift
  // from whatever the installed build actually supports.
  useEffect(() => {
    let live = true
    void api.getStreamQuality().then((q) => { if (live) setQuality(q) }).catch(() => {})
    return () => { live = false }
  }, [])

  async function pickQuality(id: string) {
    if (id === quality.current) return
    setQuality((q) => ({ ...q, current: id })) // optimistic: the buttons must feel instant
    try {
      await api.setStreamQuality(id)
      // The encoder restarts with new parameters, so reconnect rather than
      // waiting for the old session to notice.
      setRestartAt((n) => n + 1)
    } catch {
      // Put the old value back rather than leaving the UI claiming a preset the
      // car never accepted.
      void api.getStreamQuality().then(setQuality).catch(() => {})
    }
  }

  useEffect(() => {
    if (!supported || isDemo) return
    let cancelled = false

    async function begin() {
      setDetail(null)
      setState('connecting')
      try {
        await api.streamEnable()
        await api.streamView(view)
      } catch {
        if (!cancelled) {
          setState('error')
          setDetail('start')
        }
        return
      }
      if (cancelled || !canvasRef.current) return
      playerRef.current = startPlayer({
        url: api.streamSocketUrl(),
        canvas: canvasRef.current,
        onState: (s, d) => {
          if (cancelled) return
          setState(s)
          if (d) setDetail(d)
        },
      })
    }
    void begin()

    return () => {
      cancelled = true
      playerRef.current?.stop()
      playerRef.current = null
      // Fire-and-forget: the screen is going away regardless, but the car must
      // not be left encoding.
      void api.streamDisable().catch(() => {})
    }
  }, [view, supported, isDemo, restartAt])

  const label =
    state === 'live' ? t('cam.live')
    : state === 'connecting' ? t('cam.connecting')
    : detail === 'unsupported' ? t('cam.unsupported')
    : detail === 'start' ? t('cam.start_failed')
    : state === 'error' ? t('cam.error')
    : t('cam.stopped')

  return (
    <div class="screen">
      <AppHeader
        title={t('tab.camera')}
        sub={connected.value ? label : t('common.reconnecting')}
        dot={state === 'live' ? 'ok' : state === 'error' ? 'bad' : 'wait'}
      />

      <div class="card cam-card">
        <div class="cam-stage">
          <canvas ref={canvasRef} class="cam-canvas" />
          {state !== 'live' && (
            <div class="cam-overlay">
              {state === 'connecting' && <div class="cam-spinner" />}
              <span>{isDemo ? t('cam.demo') : label}</span>
              {/* WebCodecs is the only decoder here; OD's own viewer carries
                  software fallbacks, so send people there rather than shipping
                  an asm.js decoder for a case most phones never hit. */}
              {!supported && /^https?:\/\//i.test(base) && (
                <a class="btn" href={base} target="_blank" rel="noopener noreferrer">
                  {t('cam.open_od')}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">{t('cam.view')}</div>
        <div class="cam-views">
          {CAMERA_VIEWS.map((v) => (
            <button
              key={v.mode}
              class={'btn' + (v.mode === view ? ' accent' : '')}
              disabled={!connected.value || isDemo || !supported}
              onClick={() => setView(v.mode)}
            >
              {t(v.key)}
            </button>
          ))}
        </div>
        {status.value?.gpuSurveillance && <div class="screen-sub" style={{ marginTop: '10px' }}>{t('cam.note')}</div>}
      </div>

      {!!quality.options?.length && (
        <div class="card" style={{ marginTop: '14px' }}>
          <div class="card-title">{t('cam.quality')}</div>
          <div class="cam-views">
            {quality.options.map((o) => (
              <button
                key={o.id}
                class={'btn' + (o.id === quality.current ? ' accent' : '')}
                disabled={!connected.value || isDemo}
                onClick={() => pickQuality(o.id)}
              >
                {/* Resolution + fps rather than the car's English preset names,
                    which are long and would need translating to say less. */}
                {o.height ? `${o.height}p` : o.id}
                {o.fps ? <small style={{ opacity: 0.7 }}> · {o.fps}fps</small> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
