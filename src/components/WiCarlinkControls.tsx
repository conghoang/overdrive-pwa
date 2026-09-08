import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import { connected } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import {
  DEFAULT_WC_COMMANDS,
  newCommandId,
  resetCommands,
  saveCommands,
  wcCommands,
  type WcCommand,
  type WcKind,
} from '../lib/settings'
import {
  IconApp,
  IconBack,
  IconBluetooth,
  IconBolt,
  IconCar,
  IconHome,
  IconLink,
  IconLock,
  IconNext,
  IconPlay,
  IconPlus,
  IconPower,
  IconPrev,
  IconRefresh,
  IconSliders,
  IconTrash,
  IconTrunk,
  IconUnlock,
  IconWind,
} from './icons'
import './controls.css'

const ICONS: Record<string, (p: { size?: number }) => JSX.Element> = {
  bluetooth: IconBluetooth,
  power: IconPower,
  unlock: IconUnlock,
  lock: IconLock,
  bolt: IconBolt,
  trunk: IconTrunk,
  wind: IconWind,
  sliders: IconSliders,
  link: IconLink,
  app: IconApp,
  play: IconPlay,
  prev: IconPrev,
  next: IconNext,
  home: IconHome,
  back: IconBack,
  car: IconCar,
}

function iconFor(key: string) {
  return ICONS[key] || IconApp
}

export function WiCarlinkControls() {
  const [editing, setEditing] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const disabled = !connected.value
  const cmds = wcCommands.value

  async function enableAdvanced() {
    if (enabling) return
    setEnabling(true)
    try {
      const r = await api.enableAdvancedActions()
      toastResult(r, 'Advanced actions enabled')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to enable', 'err')
    } finally {
      setEnabling(false)
    }
  }

  async function fire(cmd: WcCommand) {
    if (disabled) return
    try {
      const r =
        cmd.kind === 'openApp'
          ? await api.openApp(cmd.value, cmd.label)
          : await api.fireShell(cmd.value)
      toastResult(r, cmd.label)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        toast('Enable "Advanced actions" in OverDrive → Key Mapping to run shell commands', 'err')
      } else {
        toast(e instanceof Error ? e.message : 'Command failed', 'err')
      }
    }
  }

  if (editing) {
    return <Editor onDone={() => setEditing(false)} />
  }

  return (
    <div>
      <div class="screen-head">
        <div>
          <h1 class="screen-title">51DK</h1>
          <div class="screen-sub">{disabled ? 'Reconnecting…' : 'WiCarlink kit'}</div>
        </div>
        <span class={'dot ' + (disabled ? 'wait' : 'ok')} />
      </div>

      <div class="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {cmds.map((c) => {
          const Icon = iconFor(c.icon)
          return (
            <button
              key={c.id}
              class={'action ' + (c.kind === 'openApp' ? 'tone-accent' : 'tone-default')}
              disabled={disabled}
              onClick={() => fire(c)}
            >
              <span class="action-icon"><Icon size={26} /></span>
              <span class="action-label">{c.label}</span>
            </button>
          )
        })}
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <div class="grid grid-2">
          <button class="btn" onClick={() => setEditing(true)}>Edit commands</button>
          <button class="btn accent" disabled={disabled || enabling} onClick={enableAdvanced}>
            {enabling ? <IconRefresh size={16} class="spin" /> : null} Enable advanced
          </button>
        </div>
        <p class="wc-note" style={{ marginTop: '12px' }}>
          These fire <span class="mono">am start … --es cmd …</span> at the 51DK app, which needs
          OverDrive's <b>Advanced actions</b> turned on. Tap <b>Enable advanced</b> once (or set it in
          OverDrive → Key Mapping). If a button reports “403”, advanced actions are still off.
        </p>
      </div>
    </div>
  )
}

function Editor({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<WcCommand[]>(() => wcCommands.value.map((c) => ({ ...c })))

  function update(id: string, patch: Partial<WcCommand>) {
    setDraft((d) => d.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function remove(id: string) {
    setDraft((d) => d.filter((c) => c.id !== id))
  }
  function add() {
    setDraft((d) => [
      ...d,
      { id: newCommandId(), label: 'New button', kind: 'shell', value: '', icon: 'app' },
    ])
  }
  function save() {
    const cleaned = draft
      .map((c) => ({ ...c, label: c.label.trim(), value: c.value.trim() }))
      .filter((c) => c.label && c.value)
    saveCommands(cleaned.length ? cleaned : DEFAULT_WC_COMMANDS.map((c) => ({ ...c })))
    onDone()
  }

  return (
    <div>
      <div class="screen-head">
        <div>
          <h1 class="screen-title">Edit 51DK</h1>
          <div class="screen-sub">Label + command per button</div>
        </div>
      </div>

      <div class="card">
        {draft.map((c) => (
          <div class="wc-edit-row" key={c.id}>
            <div class="wc-edit-fields">
              <div class="wc-row-top">
                <input
                  class="wc-input"
                  value={c.label}
                  placeholder="Label"
                  onInput={(e) => update(c.id, { label: (e.target as HTMLInputElement).value })}
                />
                <select
                  class="wc-kind"
                  value={c.kind}
                  onChange={(e) => update(c.id, { kind: (e.target as HTMLSelectElement).value as WcKind })}
                >
                  <option value="openApp">app</option>
                  <option value="shell">shell</option>
                </select>
              </div>
              <input
                class="wc-input mono"
                value={c.value}
                placeholder={c.kind === 'openApp' ? 'com.package.name' : 'input keyevent 85'}
                onInput={(e) => update(c.id, { value: (e.target as HTMLInputElement).value })}
              />
            </div>
            <button class="wc-del" onClick={() => remove(c.id)} aria-label="Remove">
              <IconTrash size={20} />
            </button>
          </div>
        ))}
        <button class="btn block" style={{ marginTop: '12px' }} onClick={add}>
          <IconPlus size={18} /> Add button
        </button>
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <button class="btn accent block" onClick={save}>Save</button>
        <div class="grid grid-2" style={{ marginTop: '10px' }}>
          <button class="btn" onClick={onDone}>Cancel</button>
          <button
            class="btn danger"
            onClick={() => {
              resetCommands()
              onDone()
            }}
          >
            Reset defaults
          </button>
        </div>
      </div>
    </div>
  )
}
