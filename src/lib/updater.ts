/**
 * Detect a newer deployed build and get onto it — loop-safely, and without ever
 * asking the user to clear their cache.
 *
 * version.json (never precached, fetched no-store) carries the deployed commit.
 * When it differs from the running build we try to move over in two escalating
 * steps:
 *
 *  1. Soft: ask the service worker to pull the new build, then reload. The new
 *     worker self-activates (skipWaiting/clientsClaim), so the reload normally
 *     lands on fresh content.
 *  2. Hard: if a couple of soft reloads still land on the old bundle, the
 *     precache is wedged — so tear the whole thing down (delete every cache,
 *     unregister the worker) and reload with a cache-busting query, which forces
 *     the shell to come from the network. The fresh load re-registers a clean
 *     worker. This is the self-heal that replaces "clear your browser data".
 *
 * The trap this all guards against: a reload that lands on a still-cached old
 * bundle makes version.json keep looking "newer" forever. Attempts are capped
 * per target commit in sessionStorage so nothing can loop.
 */
export function startUpdateChecks(): void {
  if (typeof __COMMIT__ === 'undefined' || __COMMIT__ === 'dev') return
  // Tidy the ?fresh= cache-buster a hard recovery may have left in the URL.
  try {
    const u = new URL(location.href)
    if (u.searchParams.has('fresh')) {
      u.searchParams.delete('fresh')
      history.replaceState(null, '', u.href)
    }
  } catch {
    /* ignore */
  }
  const url = `${import.meta.env.BASE_URL}version.json`
  const GUARD = 'odpwa.upd'
  const MAX_TRIES = 2
  const WINDOW_MS = 5 * 60 * 1000

  // c: target commit, t: last attempt, n: soft-reload count, h: hard-reset done.
  type Guard = { c: string; t: number; n: number; h?: boolean }
  const readGuard = (): Guard | null => {
    try {
      return JSON.parse(sessionStorage.getItem(GUARD) || 'null')
    } catch {
      return null
    }
  }
  const writeGuard = (g: Guard): void => {
    try {
      sessionStorage.setItem(GUARD, JSON.stringify(g))
    } catch {
      /* private mode / quota — the cap just won't persist */
    }
  }

  // A prior reload already landed on this build → the update succeeded; reset.
  const g0 = readGuard()
  if (g0 && g0.c === __COMMIT__) sessionStorage.removeItem(GUARD)

  let busy = false

  /**
   * Last resort: the service worker keeps serving a stale shell. Wipe every
   * cache, unregister the worker, and force a network load of a fresh shell.
   * The ?fresh= query sidesteps the browser's own 10-min HTTP cache of the HTML.
   */
  async function hardRecover(): Promise<void> {
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } catch {
      /* ignore */
    }
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
      await Promise.all(regs.map((r) => r.unregister()))
    } catch {
      /* ignore */
    }
    try {
      const u = new URL(location.href)
      u.searchParams.set('fresh', String(Date.now()))
      location.replace(u.href)
    } catch {
      location.reload()
    }
  }

  async function moveToUpdate(target: string): Promise<void> {
    if (busy) return
    const now = Date.now()
    const g = readGuard()
    const sameTarget = !!g && g.c === target && now - g.t < WINDOW_MS

    // Two soft reloads didn't take → the precache is wedged. Hard-reset once;
    // if even that didn't land us on the new build, stop until the next window.
    if (sameTarget && g!.n >= MAX_TRIES) {
      if (g!.h) return
      busy = true
      writeGuard({ ...g!, t: now, h: true })
      await hardRecover()
      return
    }

    busy = true
    writeGuard({ c: target, t: now, n: sameTarget ? g!.n + 1 : 1, h: sameTarget ? g!.h : false })
    // Pull the new worker (and its precache) first so the reload is fresh.
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) await reg.update()
    } catch {
      /* ignore */
    }
    location.reload()
  }

  async function check(): Promise<void> {
    if (busy) return
    // Don't reload out from under someone who's typing.
    const el = document.activeElement as HTMLElement | null
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
    try {
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) return
      const j = (await r.json()) as { commit?: string }
      if (j.commit && j.commit !== __COMMIT__) moveToUpdate(j.commit)
    } catch {
      /* offline / transient — ignore */
    }
  }

  setInterval(check, 3 * 60 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check()
  })
  window.addEventListener('online', check)
  // Also check straight away: a phone reopened on a stale shell shouldn't have
  // to wait up to three minutes to notice a new build exists.
  check()
}
