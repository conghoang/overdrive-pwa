import { signal } from '@preact/signals'
import type { JSX } from 'preact'
import { isConfigured } from './lib/api'
import * as store from './lib/store'
import { Dashboard } from './screens/Dashboard'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { lazyScreen } from './lib/lazy'

const SetupScreen = lazyScreen(() => import('./screens/Setup'), 'Setup')
/*
 * Only the first tab is guaranteed to be needed: opening the app always lands
 * on the dashboard. Every other tab is a deliberate second action, so they are
 * fetched when chosen. Controls brings the climate banner, the seat artwork and
 * the 51DK grid with it, none of which anything else uses.
 */
const ControlsTab = lazyScreen(() => import('./screens/Controls'), 'Controls')
const AccountTab = lazyScreen(() => import('./screens/Account'), 'Account')
const CameraTab = lazyScreen(() => import('./screens/Camera'), 'Camera')
const DataTab = lazyScreen(() => import('./screens/Data'), 'Data')

import { TabBar } from './components/TabBar'
import { Toaster } from './components/Toaster'

export type Tab = 'dashboard' | 'controls' | 'camera' | 'data' | 'account'

const TAB_ORDER: Tab[] = ['dashboard', 'controls', 'camera', 'data', 'account']

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
  if (which === 'controls') return <ControlsTab />
  if (which === 'camera') return <CameraTab />
  if (which === 'data') return <DataTab />
  return <AccountTab onSignOut={onSignOut} />
}

export function App() {
  const swipe = useRef<{ x: number; y: number; guard: boolean } | null>(null)
  /*
   * The screen being left, kept mounted just long enough to animate out.
   * `dir` is the direction of travel through TAB_ORDER, so tapping the last
   * tab from the first slides the same way the swipe gesture would.
   *
   * Derived DURING render, not in an effect. Effects run after the browser has
   * painted, so setting this from one meant the first painted frame showed the
   * incoming screen already sitting in its final position with no animation
   * class — then the class landed and it jumped back off-screen to slide in.
   * That one frame is the flash. Computing it here puts the class on the
   * element in the same frame it first paints, so there is nothing to see
   * before the slide starts. A ref rather than state because state set during
   * render is what causes that extra frame in the first place.
   */
  const leavingRef = useRef<{ tab: Tab; dir: 1 | -1 } | null>(null)
  const prevTab = useRef(tab.value)
  const [, forceRender] = useState(0)

  if (prevTab.current !== tab.value) {
    const from = prevTab.current
    prevTab.current = tab.value
    leavingRef.current = {
      tab: from,
      dir: TAB_ORDER.indexOf(tab.value) > TAB_ORDER.indexOf(from) ? 1 : -1,
    }
  }
  const leaving = leavingRef.current

  /*
   * Scroll reset belongs in a LAYOUT effect: it runs before paint, so the jump
   * to the top is never a visible frame of its own. Each screen keeps its own
   * scroll position, and arriving halfway down a tab you have not opened is
   * disorienting — mid-slide it also reads as a jump.
   */
  useLayoutEffect(() => {
    if (leavingRef.current) window.scrollTo(0, 0)
  }, [tab.value])

  // Clearing it is the one part that can wait: it only drops the animation
  // classes once the slide is over.
  useEffect(() => {
    if (!leavingRef.current) return
    const id = setTimeout(() => {
      leavingRef.current = null
      forceRender((n) => n + 1)
    }, TAB_ANIM_MS)
    return () => clearTimeout(id)
  }, [tab.value])

  // Not set up yet, or the backend rejected our token → show the setup screen.
  if (!configured.value || store.authLost.value) {
    return (
      <SetupScreen
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
