import { signal } from '@preact/signals'
import type { JSX } from 'preact'
import { isConfigured } from './lib/api'
import * as store from './lib/store'
import { Setup } from './screens/Setup'
import { Dashboard } from './screens/Dashboard'
import { Controls } from './screens/Controls'
import { Account } from './screens/Account'
import { useEffect, useRef, useState } from 'preact/hooks'

/**
 * Camera tab, loaded on first open only: the screen pulls in the H.264 /
 * WebCodecs player, which nobody who never opens it should have to download.
 *
 * Plain dynamic import rather than preact/compat's lazy + Suspense — that pair
 * threw "Cannot read properties of null (reading '__H')" here and rendered an
 * empty screen. Vite code-splits on the import() either way, so the only thing
 * lost is the Suspense boundary, which this replaces with a state flag.
 */
function CameraTab() {
  const [Comp, setComp] = useState<null | (() => JSX.Element)>(null)
  useEffect(() => {
    let live = true
    void import('./screens/Camera').then((m) => { if (live) setComp(() => m.Camera) })
    return () => { live = false }
  }, [])
  if (!Comp) return <div class="card"><div class="center-note">…</div></div>
  return <Comp />
}
import { TabBar } from './components/TabBar'
import { Toaster } from './components/Toaster'

export type Tab = 'dashboard' | 'controls' | 'camera' | 'account'

const TAB_ORDER: Tab[] = ['dashboard', 'controls', 'camera', 'account']

const tab = signal<Tab>('dashboard')
const configured = signal(isConfigured())

// True if the element (or an ancestor) can scroll horizontally — so a swipe there
// is a scroll (e.g. the editor's icon strip), not a tab change.
function hasScrollableX(el: HTMLElement | null): boolean {
  while (el && el !== document.body) {
    const s = getComputedStyle(el)
    if (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2) return true
    el = el.parentElement
  }
  return false
}

/** How long the tab slide runs; must match --tab-anim in global.css. */
const TAB_ANIM_MS = 260

function renderTab(which: Tab, onSignOut: () => void) {
  if (which === 'dashboard') return <Dashboard />
  if (which === 'controls') return <Controls />
  if (which === 'camera') return <CameraTab />
  return <Account onSignOut={onSignOut} />
}

export function App() {
  const swipe = useRef<{ x: number; y: number; guard: boolean } | null>(null)
  /*
   * The screen being left, kept mounted just long enough to animate out.
   * `dir` is the direction of travel through TAB_ORDER, so tapping the last
   * tab from the first slides the same way the swipe gesture would.
   */
  const [leaving, setLeaving] = useState<{ tab: Tab; dir: 1 | -1 } | null>(null)
  const prevTab = useRef(tab.value)

  useEffect(() => {
    const from = prevTab.current
    if (from === tab.value) return
    prevTab.current = tab.value
    const dir: 1 | -1 = TAB_ORDER.indexOf(tab.value) > TAB_ORDER.indexOf(from) ? 1 : -1
    setLeaving({ tab: from, dir })
    // Each screen has its own scroll position; arriving halfway down a tab you
    // have never opened is disorienting, and mid-slide it looks like a jump.
    window.scrollTo(0, 0)
    const id = setTimeout(() => setLeaving(null), TAB_ANIM_MS)
    return () => clearTimeout(id)
  }, [tab.value])

  // Not set up yet, or the backend rejected our token → show the setup screen.
  if (!configured.value || store.authLost.value) {
    return (
      <Setup
        onDone={() => {
          store.authLost.value = false
          configured.value = true
          store.start()
        }}
      />
    )
  }

  function onTouchStart(e: JSX.TargetedTouchEvent<HTMLElement>) {
    if (e.touches.length !== 1) {
      swipe.current = null
      return
    }
    const t = e.touches[0]
    const el = e.target as HTMLElement
    const tag = el?.tagName
    const guard =
      tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || hasScrollableX(el)
    swipe.current = { x: t.clientX, y: t.clientY, guard }
  }

  function onTouchEnd(e: JSX.TargetedTouchEvent<HTMLElement>) {
    const s = swipe.current
    swipe.current = null
    if (!s || s.guard) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    // mostly-horizontal swipe past the threshold, with little vertical travel, so
    // a diagonal gesture during a vertical scroll can't flip tabs.
    if (Math.abs(dx) >= 70 && Math.abs(dy) <= 45 && Math.abs(dx) >= Math.abs(dy) * 2) {
      const i = TAB_ORDER.indexOf(tab.value) + (dx < 0 ? 1 : -1)
      if (i >= 0 && i < TAB_ORDER.length) tab.value = TAB_ORDER[i]
    }
  }

  return (
    <div class="app">
      <main class="app-main" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div class={'screen-stack' + (leaving ? ' animating' : '')}>
          {leaving && (
            <div class={leaving.dir > 0 ? 'screen-out-fwd' : 'screen-out-back'} key={leaving.tab}>
              {renderTab(leaving.tab, () => (configured.value = false))}
            </div>
          )}
          {/* No animation class once the slide is over: the class carries a
              transform, and a transform left on an ancestor would re-anchor
              the fullscreen camera's position: fixed to this element. */}
          <div
            class={leaving ? (leaving.dir > 0 ? 'screen-in-fwd' : 'screen-in-back') : undefined}
            key={tab.value}
          >
            {renderTab(tab.value, () => (configured.value = false))}
          </div>
        </div>
      </main>
      <TabBar active={tab.value} onChange={(t) => (tab.value = t)} />
      <Toaster />
    </div>
  )
}
