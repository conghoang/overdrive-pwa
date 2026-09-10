import { useEffect, useRef, useState } from 'preact/hooks'
import * as api from '../lib/api'
import { CAMERA_VIEWS } from '../lib/api'
import { connected } from '../lib/store'
import { dewarpByView, setDewarpFor } from '../lib/settings'
import { AppHeader } from '../components/AppHeader'
import { t } from '../lib/i18n'
import { IconApp, IconCamera } from '../components/icons'
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
  // Dewarp strength. The car's own recording.rectifyStrength is the starting
  // point; once the user moves the slider their value is kept instead.
  const [carRectify, setCarRectify] = useState(0)
  // Per camera: switching view brings that camera's own correction with it.
  const strength = dewarpByView.value[String(view)] ?? carRectify
  const tiles = view === 0 ? 2 : 1
  const [detail, setDetail] = useState<string | null>(null)
  const supported = webCodecsSupported()
  const base = api.getBaseUrl()
  const isDemo = !/^https?:\/\//i.test(base)

  // Presets are read from the car rather than hardcoded, so they cannot drift
  // from whatever the installed build actually supports.
  useEffect(() => {
    let live = true
    void api.getStreamQuality().then((q) => { if (live) setQuality(q) }).catch(() => {})
    void api.getRectifyStrength().then((v) => { if (live) setCarRectify(v) }).catch(() => {})
    return () => { live = false }
  }, [])

  /*
   * Held in a ref as well as state. The stream effect does not list rectify in
   * its deps (a strength change must not reconnect), so its closure would other-
   * wise capture the value from mount — which is 0, before the car has answered.
   * The ref gives player creation the live value; the effect covers changes made
   * after it exists.
   */
  const strengthRef = useRef(0)
  useEffect(() => {
    strengthRef.current = strength
    playerRef.current?.setStrength(strength)
  }, [strength])

  // The mosaic is four cameras in one frame, so the correction runs per tile.
  const tilesRef = useRef(1)
  useEffect(() => {
    tilesRef.current = tiles
    playerRef.current?.setTiles(tiles)
  }, [tiles])

  async function pickQuality(id: string) {
    if (id === quality.current) return
    // Never POST a preset the car did not offer. A change event that fires
    // before the options land (or for any value not in the list) must be a
    // no-op rather than pushing a setting onto the car unasked.
    if (!quality.options?.some((o) => o.id === id)) return
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
        strength: strengthRef.current,
        tiles: tilesRef.current,
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
    <div class="screen cam-screen">
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

      {/* One compact control strip: camera picker and quality side by side, so
          the video and the controls fit on screen together. Anything taller
          meant scrolling up to watch and down to switch, which is the wrong
          trade for a live view. */}
      <div class="card cam-controls">
        <div class="cam-picker">
          <svg class="cam-car" viewBox="0 0 200 300" aria-hidden="true">
            <rect x="46" y="16" width="108" height="268" rx="46" class="cc-body" />
            <path d="M68 74 Q100 60 132 74 L127 100 Q100 90 73 100 Z" class="cc-glass" />
            <rect x="70" y="116" width="60" height="66" rx="13" class="cc-roof" />
            <path d="M73 214 Q100 202 127 214 L132 238 Q100 226 68 238 Z" class="cc-glass" />
            {[
              [40, 84],
              [148, 84],
              [40, 200],
              [148, 200],
            ].map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width="12" height="34" rx="5" class="cc-wheel" />
            ))}
          </svg>

          {/* Icon-only: at this size a text label would not fit, and position
              already says which camera it is. The name is spelled out beside
              the diagram and in the accessible name. */}
          {CAMERA_VIEWS.filter((v) => v.mode !== 0).map((v) => (
            <button
              key={v.mode}
              class={`cam-hotspot pos-${v.mode}` + (v.mode === view ? ' on' : '')}
              disabled={!connected.value || isDemo || !supported}
              title={t(v.key)}
              aria-label={t(v.key)}
              aria-pressed={v.mode === view}
              onClick={() => setView(v.mode)}
            >
              <IconCamera size={15} />
            </button>
          ))}

          <button
            class={'cam-hotspot pos-all' + (view === 0 ? ' on' : '')}
            disabled={!connected.value || isDemo || !supported}
            title={t('cam.mosaic')}
            aria-label={t('cam.mosaic')}
            aria-pressed={view === 0}
            onClick={() => setView(0)}
          >
            <IconApp size={15} />
          </button>
        </div>

        <div class="cam-side">
          <div class="cam-current-k">{t('cam.view')}</div>
          <div class="cam-current">{t(CAMERA_VIEWS.find((v) => v.mode === view)?.key ?? 'cam.front')}</div>

          <div class="cam-current-k cam-dewarp-k">
            {t('cam.dewarp')} <b>{strength}</b>
          </div>
          <input
            class="slider cam-dewarp-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={strength}
            style={{ ['--fill' as string]: `${strength}%` }}
            aria-label={t('cam.dewarp')}
            disabled={!connected.value || isDemo}
            onInput={(e) => setDewarpFor(view, Number((e.target as HTMLInputElement).value))}
          />

          {!!quality.options?.length && (
            <>
              <div class="cam-current-k" style={{ marginTop: '12px' }}>{t('cam.quality')}</div>
              <select
                class="qual-select"
                value={quality.current ?? ''}
                disabled={!connected.value || isDemo}
                onChange={(e) => void pickQuality((e.target as HTMLSelectElement).value)}
              >
                {quality.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.height ? `${o.height}p` : o.id}
                    {o.fps ? ` · ${o.fps}fps` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
