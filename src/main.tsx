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

// The dev build forces the tyre + location pair side by side at any width, to
// preview the foldable two-up layout without a foldable. Production is untouched.
if (import.meta.env.DEV || import.meta.env.BASE_URL.includes('/dev/')) {
  document.documentElement.classList.add('twoup')
}

// Async (IndexedDB): the first paint shows the bundled default and the stored
// photo swaps in when it resolves.
void initCarPhoto()

if (isConfigured()) store.start()
startUpdateChecks()

render(<App />, document.getElementById('app')!)
