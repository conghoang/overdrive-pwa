import { lazyScreen } from '../lib/lazy'

/**
 * The 3D car hero on demand — three.js and the model are loaded at runtime, and
 * even this glue + its CSS stay out of the app shell for the many installs that
 * never turn the 3D model on. Renders nothing while the chunk arrives.
 */
export const Car3DHeroLazy = lazyScreen(() => import('./Car3DHero'), 'Car3DHero', null)
