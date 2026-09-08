import { render } from 'preact'
import { App } from './app'
import { isConfigured } from './lib/api'
import * as store from './lib/store'
import './styles/tokens.css'
import './styles/global.css'

if (isConfigured()) store.start()

render(<App />, document.getElementById('app')!)
