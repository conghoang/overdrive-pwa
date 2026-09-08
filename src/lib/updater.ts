/**
 * Detect a newer deployed build and reload. Fetches version.json (which carries
 * the build commit) on an interval, on tab refocus, and on network reconnect;
 * reloads when the commit differs from the one this page was built with.
 */
export function startUpdateChecks(): void {
  if (typeof __COMMIT__ === 'undefined' || __COMMIT__ === 'dev') return
  const url = `${import.meta.env.BASE_URL}version.json`

  async function check(): Promise<void> {
    // Don't reload out from under someone who's typing.
    const el = document.activeElement as HTMLElement | null
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
    try {
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) return
      const j = (await r.json()) as { commit?: string }
      if (j.commit && j.commit !== __COMMIT__) location.reload()
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
