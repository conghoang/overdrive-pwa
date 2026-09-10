/**
 * The demo-mode sentinels, alone in their own module.
 *
 * api.ts needs to RECOGNISE demo mode on every request, but only needs the
 * fixtures when it is actually in it. Keeping these two constants here is what
 * lets mock.ts be a dynamic import — while they lived alongside the fixtures,
 * the static import dragged the whole module into the entry chunk and the
 * dynamic import silently did nothing.
 */
export const DEMO_BASE = 'demo'
export const DEMO_TOKEN = 'demo'
