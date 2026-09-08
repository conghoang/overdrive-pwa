import type { JSX } from 'preact'
import type { Tab } from '../app'
import { IconGauge, IconSliders, IconUser } from './icons'
import './TabBar.css'

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'dashboard', label: 'Vehicle', icon: IconGauge },
  { id: 'controls', label: 'Controls', icon: IconSliders },
  { id: 'account', label: 'Account', icon: IconUser },
]

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav class="tabbar">
      <div class="tabbar-inner">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              class={'tab' + (active === t.id ? ' active' : '')}
              onClick={() => onChange(t.id)}
              aria-current={active === t.id ? 'page' : undefined}
            >
              <Icon size={23} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
