import { signal } from '@preact/signals'
import { isConfigured } from './lib/api'
import * as store from './lib/store'
import { Setup } from './screens/Setup'
import { Dashboard } from './screens/Dashboard'
import { Controls } from './screens/Controls'
import { Account } from './screens/Account'
import { TabBar } from './components/TabBar'
import { Toaster } from './components/Toaster'

export type Tab = 'dashboard' | 'controls' | 'account'

const tab = signal<Tab>('dashboard')
const configured = signal(isConfigured())

export function App() {
  // Not set up yet, or the backend rejected our token → show the setup screen.
  if (!configured.value || store.authLost.value) {
    return (
      <Setup
        onDone={() => {
          store.authLost.value = false
          configured.value = true
          store.start()
        }}
      />
    )
  }

  return (
    <div class="app">
      <main class="app-main">
        {tab.value === 'dashboard' && <Dashboard />}
        {tab.value === 'controls' && <Controls />}
        {tab.value === 'account' && <Account onSignOut={() => (configured.value = false)} />}
      </main>
      <TabBar active={tab.value} onChange={(t) => (tab.value = t)} />
      <Toaster />
    </div>
  )
}
