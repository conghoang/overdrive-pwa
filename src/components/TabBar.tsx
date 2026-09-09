import type { JSX } from 'preact'
import type { Tab } from '../app'
import { IconCamera, IconGauge, IconGear, IconSliders } from './icons'
import { t } from '../lib/i18n'
import { tapFeedback } from '../lib/haptics'
import './TabBar.css'

const TABS: { id: Tab; key: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'dashboard', key: 'tab.vehicle', icon: IconGauge },
  { id: 'controls', key: 'tab.controls', icon: IconSliders },
  { id: 'camera', key: 'tab.camera', icon: IconCamera },
  { id: 'account', key: 'tab.device', icon: IconGear },
]

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav class="tabbar">
      <div class="tabbar-inner">
        {TABS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              class={'tab' + (active === item.id ? ' active' : '')}
              onClick={() => { tapFeedback(); onChange(item.id) }}
              aria-current={active === item.id ? 'page' : undefined}
            >
              <Icon size={23} />
              <span>{t(item.key)}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
