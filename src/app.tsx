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

export function App() {
  const swipe = useRef<{ x: number; y: number; guard: boolean } | null>(null)

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
        <div class="screen-anim" key={tab.value}>
          {tab.value === 'dashboard' && <Dashboard />}
          {tab.value === 'controls' && <Controls />}
          {tab.value === 'camera' && <CameraTab />}
          {tab.value === 'account' && <Account onSignOut={() => (configured.value = false)} />}
        </div>
      </main>
      <TabBar active={tab.value} onChange={(t) => (tab.value = t)} />
      <Toaster />
    </div>
  )
}
