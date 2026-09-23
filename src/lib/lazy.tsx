import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { t } from './i18n'

/**
 * Load a screen on first open only.
 *
 * Camera pulls in the H.264 / WebCodecs player and Data pulls in the charts —
 * neither belongs in the bundle of someone who never opens that tab. The two
 * tabs people use on every launch stay eager, so the app still paints straight
 * into the dashboard with no extra round-trip.
 *
 * Plain dynamic import rather than preact/compat's lazy + Suspense — that pair
 * threw "Cannot read properties of null (reading '__H')" here and rendered an
 * empty screen. Vite code-splits on the import() either way, so the only thing
 * lost is the Suspense boundary, which this replaces with a state flag.
 */
export function lazyScreen<P extends Record<string, unknown>, K extends string>(
  load: () => Promise<Record<K, (props: P) => JSX.Element | null>>,
  name: K,
  /**
   * What to show while the chunk arrives. Screens want the placeholder; a card
   * that is conditional anyway wants nothing, because a beat of empty space
   * reads as "not charging yet" rather than as a loading state.
   */
  pending: JSX.Element | null = <div class="card"><div class="center-note">…</div></div>,
) {
  return function LazyScreen(props: P) {
    const [Comp, setComp] = useState<null | ((props: P) => JSX.Element | null)>(null)
    // The chunk import can REJECT — most often after a deploy, when a stale
    // service worker serves old HTML that points at chunk filenames its cache no
    // longer has, so the fetch 404s. Without this the screen hung on the "…"
    // placeholder forever. Track the failure and offer a full reload, which
    // re-fetches the HTML and lets the new service worker take over.
    const [failed, setFailed] = useState(false)
    useEffect(() => {
      let live = true
      // setComp(() => C) — the updater form, or React/Preact would CALL the
      // component instead of storing it.
      load().then(
        (m) => { if (live) setComp(() => m[name]) },
        () => { if (live) setFailed(true) },
      )
      return () => { live = false }
    }, [])
    if (failed) {
      return (
        <div class="screen">
          <div class="card">
            <div class="center-note" style={{ display: 'grid', gap: '14px', justifyItems: 'center' }}>
              <span>{t('common.load_failed')}</span>
              <button class="btn accent" onClick={() => location.reload()}>{t('common.reload')}</button>
            </div>
          </div>
        </div>
      )
    }
    if (!Comp) return pending
    return <Comp {...props} />
  }
}

/*
 * Pairing is a once-ever screen: after it succeeds the app never renders it
 * again unless the token is rejected. Shipping it — and the QR scanner it pulls
 * in — to every launch of an already-configured app is the largest thing in the
 * shell that most sessions never touch.
 */
