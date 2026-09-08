/**
 * Detect a newer deployed build and reload — loop-safely.
 *
 * The trap: if a reload lands on a still-cached old bundle, version.json keeps
 * looking "newer" and the app would reload forever. Guards:
 *  - Before reloading, ask the service worker to fetch the new build so the
 *    reload actually serves fresh content (not the SW precache).
 *  - Cap reload attempts per target commit in sessionStorage; after a couple of
 *    tries that didn't take (caching/CDN lag) we stop and wait, rather than loop.
 */
export function startUpdateChecks(): void {
  if (typeof __COMMIT__ === 'undefined' || __COMMIT__ === 'dev') return
  const url = `${import.meta.env.BASE_URL}version.json`
  const GUARD = 'odpwa.upd'
  const MAX_TRIES = 2
  const WINDOW_MS = 5 * 60 * 1000

  type Guard = { c: string; t: number; n: number }
  const readGuard = (): Guard | null => {
    try {
      return JSON.parse(sessionStorage.getItem(GUARD) || 'null')
    } catch {
      return null
    }
  }

  // A prior reload already landed on this build → the update succeeded; reset.
  const g0 = readGuard()
  if (g0 && g0.c === __COMMIT__) sessionStorage.removeItem(GUARD)

  let reloading = false

  async function reloadForUpdate(target: string): Promise<void> {
    if (reloading) return
    const now = Date.now()
    const g = readGuard()
    // Already tried this exact target a couple of times recently and it didn't
    // stick → stop to avoid a reload loop; the SW will pick it up eventually.
    if (g && g.c === target && g.n >= MAX_TRIES && now - g.t < WINDOW_MS) return

    reloading = true
    const n = g && g.c === target && now - g.t < WINDOW_MS ? g.n + 1 : 1
    try {
      sessionStorage.setItem(GUARD, JSON.stringify({ c: target, t: now, n }))
    } catch {
      /* ignore */
    }
    // Pull the new service worker (and its precache) first so the reload is fresh.
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) await reg.update()
    } catch {
      /* ignore */
    }
    location.reload()
  }

  async function check(): Promise<void> {
    if (reloading) return
    // Don't reload out from under someone who's typing.
    const el = document.activeElement as HTMLElement | null
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
    try {
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) return
      const j = (await r.json()) as { commit?: string }
      if (j.commit && j.commit !== __COMMIT__) reloadForUpdate(j.commit)
    } catch {
      /* offline / transient — ignore */
    }
  }

  setInterval(check, 3 * 60 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check()
  })
  window.addEventListener('online', check)
}
