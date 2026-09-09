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
  const [detail, setDetail] = useState<string | null>(null)
  const supported = webCodecsSupported()
  const base = api.getBaseUrl()
  const isDemo = !/^https?:\/\//i.test(base)

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
  }, [view, supported, isDemo])

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
    </div>
  )
}
