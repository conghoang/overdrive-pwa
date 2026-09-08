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
  IconArrow,
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

/**
 * The 51DK command grid — drops in where the default remote-action buttons are
 * on the Controls screen (replacing only those). Commands are fixed; if the
 * backend rejects a shell action (403, advanced actions off) we prompt to
 * enable it on demand rather than showing a permanent control.
 */
export function WiCarlinkGrid() {
  const [pending, setPending] = useState<WcCommand | null>(null)
  const [enabling, setEnabling] = useState(false)
  const disabled = !connected.value
  const cmds = wcCommands.value.length ? wcCommands.value : DEFAULT_WC_COMMANDS

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
        setPending(cmd) // advanced actions off → ask to enable
      } else {
        toast(e instanceof Error ? e.message : 'Command failed', 'err')
      }
    }
  }

  async function confirmEnable() {
    if (enabling) return
    const retry = pending
    setEnabling(true)
    try {
      await api.enableAdvancedActions()
      toast('Advanced actions enabled', 'ok')
      setPending(null)
      if (retry) await fire(retry)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not enable advanced actions', 'err')
    } finally {
      setEnabling(false)
    }
  }

  return (
    <div>
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

      {pending && (
        <div class="modal-backdrop" onClick={() => !enabling && setPending(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h3 class="modal-title">Enable advanced actions?</h3>
            <p class="modal-body">
              51DK buttons run a command on the head unit, which needs OverDrive's
              “Advanced actions” turned on. Enable it now and run <b>{pending.label}</b>?
            </p>
            <div class="grid grid-2">
              <button class="btn" disabled={enabling} onClick={() => setPending(null)}>
                Cancel
              </button>
              <button class="btn accent" disabled={enabling} onClick={confirmEnable}>
                {enabling ? 'Enabling…' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Full-screen editor: add / remove / reorder / edit 51DK command buttons. */
export function WiCarlinkEditor({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<WcCommand[]>(() => wcCommands.value.map((c) => ({ ...c })))

  function update(id: string, patch: Partial<WcCommand>) {
    setDraft((d) => d.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function remove(id: string) {
    setDraft((d) => d.filter((c) => c.id !== id))
  }
  function move(index: number, dir: -1 | 1) {
    setDraft((d) => {
      const next = index + dir
      if (next < 0 || next >= d.length) return d
      const copy = d.slice()
      const [item] = copy.splice(index, 1)
      copy.splice(next, 0, item)
      return copy
    })
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
          <div class="screen-sub">Add, remove, reorder or edit buttons</div>
        </div>
        <button class="btn ghost" style={{ padding: '8px 12px' }} onClick={onDone}>
          <IconBack size={18} /> Back
        </button>
      </div>

      <div class="card">
        {draft.map((c, i) => (
          <div class="wc-edit-row" key={c.id}>
            <div class="wc-reorder">
              <button class="wc-move" disabled={i === 0} aria-label="Move up" onClick={() => move(i, -1)}>
                <IconArrow size={16} class="rot-up" />
              </button>
              <button
                class="wc-move"
                disabled={i === draft.length - 1}
                aria-label="Move down"
                onClick={() => move(i, 1)}
              >
                <IconArrow size={16} class="rot-down" />
              </button>
            </div>
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
                placeholder={c.kind === 'openApp' ? 'com.package.name' : 'am start -n …'}
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
        <p class="wc-note" style={{ marginBottom: '12px' }}>
          <b>shell</b> commands (am / input / adb) need OverDrive's <b>Advanced actions</b> enabled.
        </p>
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
