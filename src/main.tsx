import { render } from 'preact'
import { App } from './app'
import { isConfigured } from './lib/api'
import * as store from './lib/store'
import { startUpdateChecks } from './lib/updater'
import { initTheme } from './lib/theme'
import { initCarPhoto } from './lib/settings'
import './styles/tokens.css'
import './styles/global.css'

// Before render, so the first paint is already in the right theme.
initTheme()

// Dev-only layout preview: `?twoup` forces the tyre + location pair side by side
// at any width, so the foldable two-up layout can be tested without a foldable.
// Honoured only on the dev build (and local dev), never in production.
const devBuild = import.meta.env.DEV || import.meta.env.BASE_URL.includes('/dev/')
if (devBuild && new URLSearchParams(location.search).has('twoup')) {
  document.documentElement.classList.add('twoup')
}

// Async (IndexedDB): the first paint shows the bundled default and the stored
// photo swaps in when it resolves.
void initCarPhoto()

if (isConfigured()) store.start()
startUpdateChecks()

render(<App />, document.getElementById('app')!)
