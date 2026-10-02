import { lazyScreen } from '../lib/lazy'

/**
 * The map, and the Google Maps glue around it, on demand.
 *
 * It is gated on a setting that defaults OFF, so for most installs this code
 * never runs at all — no reason for it to sit in the app shell. Renders nothing
 * while it loads; the map already pops in asynchronously once Google Maps
 * itself arrives, so one more beat is invisible.
 */
export const MiniMapLazy = lazyScreen(() => import('./MiniMap'), 'MiniMap', null)
