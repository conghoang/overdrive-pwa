import { signal } from '@preact/signals'

/**
 * Theme selection.
 *
 * Three choices, not two: "system" follows the phone, and it has to be a
 * distinct stored value rather than being resolved once at save time — a phone
 * on an automatic day/night schedule must keep following it.
 *
 * Default is `dark`, not `system`. The app shipped dark-only, so anyone
 * updating already has a dark app; silently flipping them to light because
 * their phone is in light mode would be a surprise, not a feature. New users
 * can pick System in Settings.
 */
export type Theme = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'odpwa.theme'
const DEFAULT: Theme = 'dark'

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'system' || v === 'light' || v === 'dark') return v
  } catch {
    /* private mode / storage disabled — fall through to the default */
  }
  return DEFAULT
}

/** What the user chose. */
export const theme = signal<Theme>(read())
/** What is actually on screen, after resolving "system". */
export const resolvedTheme = signal<ResolvedTheme>('dark')

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null

function resolve(t: Theme): ResolvedTheme {
  if (t === 'system') return media?.matches ? 'light' : 'dark'
  return t
}

/** Keep the browser/OS chrome in step with the page. */
function paintChrome(bg: string) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg))
}

function apply() {
  const r = resolve(theme.value)
  resolvedTheme.value = r
  const root = document.documentElement
  // Dark is the token default, so it needs no attribute — but set it anyway so
  // `data-theme` always states the truth for anything inspecting the DOM.
  root.dataset.theme = r
  root.style.colorScheme = r
  // Read the resolved background back out rather than hardcoding it here, so
  // the chrome can never drift from the palette.
  const bg = getComputedStyle(root).getPropertyValue('--app-bg').trim()
  if (bg) paintChrome(bg)
}

export function setTheme(t: Theme) {
  theme.value = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* not fatal: the theme still applies for this session */
  }
  apply()
}

/** Call once at boot. */
export function initTheme() {
  apply()
  // Only matters while the choice is "system", but staying subscribed is
  // cheaper than adding and removing the listener on every change.
  media?.addEventListener?.('change', () => {
    if (theme.value === 'system') apply()
  })
}
