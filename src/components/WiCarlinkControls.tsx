import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import { connected } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { DEFAULT_WC_COMMANDS, type WcCommand } from '../lib/settings'
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
  IconPower,
  IconPrev,
  IconSliders,
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
        {DEFAULT_WC_COMMANDS.map((c) => {
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
