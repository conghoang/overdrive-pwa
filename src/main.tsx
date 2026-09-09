import { render } from 'preact'
import { App } from './app'
import { isConfigured } from './lib/api'
import * as store from './lib/store'
import { startUpdateChecks } from './lib/updater'
import { initTheme } from './lib/theme'
import './styles/tokens.css'
import './styles/global.css'

// Before render, so the first paint is already in the right theme.
initTheme()

if (isConfigured()) store.start()
startUpdateChecks()

render(<App />, document.getElementById('app')!)
