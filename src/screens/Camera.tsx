import { useEffect, useRef, useState } from 'preact/hooks'
import * as api from '../lib/api'
import { CAMERA_VIEWS } from '../lib/api'
import { connected } from '../lib/store'
import { dewarpByView, setDewarpFor } from '../lib/settings'
import { AppHeader } from '../components/AppHeader'
import { t } from '../lib/i18n'
import type { JSX } from 'preact'
import { IconClose, IconExpand } from '../components/icons-extra'
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
/*
 * The head unit has ONE pipeline, and enable/disable are absolute rather than
 * refcounted. Sent concurrently they race: switching camera fires the old
 * effect's disable and the new effect's enable as two independent requests
 * through the tunnel, and if the disable is served second the pipeline ends up
 * off while a socket sits open waiting for frames that never come — a spinner
 * that only leaving the tab clears. Queueing them makes the order the order
 * they were issued in.
 */
let streamQueue: Promise<unknown> = Promise.resolve()
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const next = streamQueue.then(fn, fn) // a failed predecessor must not block the queue
  streamQueue = next.catch(() => {})
  return next
}

/*
 * The AVM pipeline cold-starts in a few seconds, and until it is up the car
 * answers enable with HTTP 200 {success:false, starting:true} — its own comment
 * calls this "the client re-polls until pipelineRunning flips true". Nothing
 * here re-polled, so a parked car with a cold pipeline showed "Connecting…"
 * forever: not an error, just a request whose answer was "ask again".
 */
async function enableStream(isCancelled: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await queued(() => api.streamEnable())
    if (isCancelled()) return
    if (res?.success !== false || res.starting !== true) return
    await new Promise((r) => setTimeout(r, 700))
    if (isCancelled()) return
  }
  throw new Error('stream did not start')
}

/** Top-down car with the active camera's edge highlighted (mosaic = 4-grid). */
function CamIcon({ mode }: { mode: number }): JSX.Element {
  if (mode === 0) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  }
  const edge =
    mode === 1 ? <rect x="8" y="3.2" width="8" height="2.6" rx="1.1" fill="currentColor" stroke="none" />
    : mode === 2 ? <rect x="18.2" y="8" width="2.6" height="8" rx="1.1" fill="currentColor" stroke="none" />
    : mode === 3 ? <rect x="8" y="18.2" width="8" height="2.6" rx="1.1" fill="currentColor" stroke="none" />
    : <rect x="3.2" y="8" width="2.6" height="8" rx="1.1" fill="currentColor" stroke="none" />
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={1.6}>
      <rect x="6" y="6" width="12" height="12" rx="3" />{edge}
    </svg>
  )
}

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
  const [full, setFull] = useState(false)
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

  /*
   * Backgrounding the app must stop the stream.
   *
   * Switching tabs already unmounts this screen, but locking the phone or
   * swapping apps does not: the effect never re-ran, so the socket stayed open
   * and the car kept encoding at full rate in the owner's pocket. That is the
   * most expensive thing this app can leave running, and the poll in store.ts
   * already backs off when hidden — this was the one place that didn't.
   */
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => {
    const sync = () => setVisible(!document.hidden)
    /*
     * pagehide must force false, not re-read document.hidden. The case it
     * exists for is iOS skipping visibilitychange when the app is swiped away —
     * and there document.hidden is still false, so sync() would compute
     * setVisible(true) and stop nothing. Sharing the handler made the listener
     * dead code in both directions.
     */
    const onHide = () => setVisible(false)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])

  useEffect(() => {
    if (!supported || isDemo || !visible) return
    let cancelled = false

    async function begin() {
      setDetail(null)
      setState('connecting')
      try {
        await enableStream(() => cancelled)
        if (cancelled) return
        await queued(() => api.streamView(view))
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
      // Fire-and-forget, but QUEUED: the screen is going away regardless and we
      // will not await it, yet it still has to land before the next enable.
      void queued(() => api.streamDisable()).catch(() => {})
    }
  }, [view, supported, isDemo, restartAt, visible])

  /*
   * Fullscreen is CSS first, Fullscreen API second.
   *
   * iOS Safari only grants real fullscreen to <video> elements, and this is a
   * <canvas> — requestFullscreen simply rejects there. So the overlay does the
   * work everywhere, and the API is a bonus on Android/desktop where it also
   * hides the browser chrome. Either way the canvas NODE is untouched: it only
   * gets restyled, because tearing it down would take the WebGL context and the
   * running stream with it.
   */
  function toggleFull() {
    const next = !full
    setFull(next)
    try {
      if (next) void document.documentElement.requestFullscreen?.()
      else if (document.fullscreenElement) void document.exitFullscreen?.()
    } catch {
      /* overlay still applies */
    }
  }

  // Escape or the system back gesture leaves fullscreen without telling us.
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement && full) setFull(false)
    }
    /*
     * Escape has to be handled here too, not just via fullscreenchange. When
     * requestFullscreen is refused — which is always on iOS Safari for a
     * <canvas> — the overlay is the only thing that happened, so the browser
     * never fires fullscreenchange and Escape would do nothing at all.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && full) setFull(false)
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('keydown', onKey)
    }
  }, [full])

  const label =
    state === 'live' ? t('cam.live')
    : state === 'connecting' ? t('cam.connecting')
    : detail === 'unsupported' ? t('cam.unsupported')
    : detail === 'start' ? t('cam.start_failed')
    : state === 'error' ? t('cam.error')
    : t('cam.stopped')

  // One "live" signal only (the badge on the feed + the status dot). When live,
  // the subtitle carries the current view name rather than repeating "Live".
  const viewName = t(CAMERA_VIEWS.find((v) => v.mode === view)?.key ?? 'cam.front')
  const subText = !connected.value ? t('common.reconnecting') : state === 'live' ? viewName : label

  return (
    <div class="screen cam-screen">
      <AppHeader
        title={t('tab.camera')}
        sub={subText}
        dot={state === 'live' ? 'ok' : state === 'error' ? 'bad' : 'wait'}
      />

      <div class={'card cam-card' + (full ? ' full' : '')}>
        <div class={'cam-stage' + (full ? ' full' : '')}>
          <canvas ref={canvasRef} class="cam-canvas" />
          {state === 'live' && <span class="cam-live"><span class="cam-live-dot" />LIVE</span>}
          <button
            class="cam-full"
            title={t(full ? 'cam.exit_full' : 'cam.fullscreen')}
            aria-label={t(full ? 'cam.exit_full' : 'cam.fullscreen')}
            onClick={toggleFull}
          >
            {full ? <IconClose size={18} /> : <IconExpand size={18} />}
          </button>
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
          <div class="cam-views">
            {CAMERA_VIEWS.map((v) => (
              <button
                key={v.mode}
                class={'cam-view' + (v.mode === view ? ' on' : '')}
                disabled={!connected.value || isDemo || !supported}
                aria-pressed={v.mode === view}
                aria-label={t(v.key)}
                onClick={() => setView(v.mode)}
              >
                <CamIcon mode={v.mode} />
                {t(v.key)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Controls below the video; camera switching lives on the feed above. */}
      <div class="card cam-controls">
        {!!quality.options?.length && (
          <div class="cam-row">
            <span class="cam-k">{t('cam.quality')}</span>
            <div class="cam-seg">
              {quality.options.map((o) => (
                <button
                  key={o.id}
                  class={o.id === quality.current ? 'on' : undefined}
                  disabled={!connected.value || isDemo}
                  onClick={() => void pickQuality(o.id)}
                >
                  {o.height ? `${o.height}p` : o.id}
                </button>
              ))}
            </div>
          </div>
        )}

        <div class="cam-row cam-row-block">
          <span class="cam-k">{t('cam.dewarp')} <b>{strength}</b></span>
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
        </div>
      </div>
    </div>
  )
}
