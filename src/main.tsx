import { render } from 'preact'
import { App } from './app'
import { isConfigured } from './lib/api'
import * as store from './lib/store'
import { startUpdateChecks } from './lib/updater'
import './styles/tokens.css'
import './styles/global.css'

if (isConfigured()) store.start()
startUpdateChecks()

render(<App />, document.getElementById('app')!)
