import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
/**
 * Escape closes an open overlay.
 *
 * Both dialogs here could only be dismissed by clicking the backdrop — which
 * is not a control, has no keyboard equivalent, and cannot be reached by
 * anyone who is not using a pointer. Passing null for `onClose` covers the
 * "cannot be dismissed right now" case (a command mid-flight).
 */
export function useEscape(onClose: (() => void) | null) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
}
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import { connected } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { t } from '../lib/i18n'
import { DEFAULT_WC_COMMANDS, wcCommands, type WcCommand } from '../lib/settings'
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

export function iconFor(key: string) {
  return ICONS[key] || IconApp
}

// order shown in the editor's icon picker
export const ICON_KEYS = [
  'bluetooth', 'power', 'unlock', 'lock', 'bolt', 'trunk', 'wind', 'sliders',
  'play', 'prev', 'next', 'home', 'back', 'car', 'link', 'app',
]

/**
 * Accessible name for an icon cell.
 *
 * Translating sixteen pictogram names would add sixteen dictionary entries for
 * a purely decorative choice, so the name is positional instead — "Icon 5 of
 * 16" is honest, localises for free, and is genuinely more useful than the
 * English word "sliders" spoken to someone reading a Vietnamese UI.
 */
export function iconLabel(key: string): string {
  return `${t('wc.choose_icon')} ${ICON_KEYS.indexOf(key) + 1}/${ICON_KEYS.length}`
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
  // Null while a command is in flight: the dialog must not vanish mid-enable.
  useEscape(pending && !enabling ? () => setPending(null) : null)
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
        toast(e instanceof Error ? e.message : t('wc.command_failed'), 'err')
      }
    }
  }

  async function confirmEnable() {
    if (enabling) return
    const retry = pending
    setEnabling(true)
    try {
      await api.enableAdvancedActions()
      toast(t('wc.advanced_enabled'), 'ok')
      setPending(null)
      if (retry) await fire(retry)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('wc.advanced_fail'), 'err')
    } finally {
      setEnabling(false)
    }
  }

  // Five or fewer read better as a single row; past that, wrap at four so the
  // rows stay even rather than trailing an orphan.
  const cols = cmds.length <= 5 ? cmds.length : 4

  return (
    <div>
      <div
        class={'grid action-grid' + (cols >= 5 ? ' tight' : '')}
        style={{ ['--cols' as string]: cols }}
      >
        {cmds.map((c) => {
          const Icon = iconFor(c.icon)
          return (
            <button
              key={c.id}
              class={'action ' + (c.kind === 'openApp' ? 'tone-accent' : 'tone-default')}
              disabled={disabled}
              onClick={() => fire(c)}
            >
              <span class="action-icon"><Icon size={22} /></span>
              <span class="action-label">{c.label}</span>
            </button>
          )
        })}
      </div>

      {pending && (
        <div class="modal-backdrop" onClick={() => !enabling && setPending(null)}>
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wc-enable-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="modal-title" id="wc-enable-title">{t('wc.enable_advanced_q')}</h3>
            <p class="modal-body">{t('wc.enable_body', { label: pending.label })}</p>
            <div class="grid grid-2">
              <button class="btn" disabled={enabling} onClick={() => setPending(null)}>
                {t('wc.cancel')}
              </button>
              <button class="btn accent" disabled={enabling} onClick={confirmEnable}>
                {enabling ? t('wc.enabling') : t('wc.enable')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
