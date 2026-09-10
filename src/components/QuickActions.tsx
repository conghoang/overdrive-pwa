import type { JSX } from 'preact'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import type { ControlResult } from '../lib/types'
import { connected, refresh } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { t } from '../lib/i18n'
import { tapFeedback } from '../lib/haptics'
import { wicarlink } from '../lib/settings'
import { IconBolt, IconLock, IconTrunk, IconUnlock } from './icons'

// 51DK commands (same as the WiCarlink buttons): fire an intent at the app.
const WC_ACTIVITY = 'com.wicarlink.digitalcarkey/.ui.activity.LauncherActivity'
const wc = (cmd: string) => `am start -n ${WC_ACTIVITY} --es cmd ${cmd}`

async function fire(cmd: string, ok: string) {
  try {
    toastResult(await api.fireShell(wc(cmd)), ok)
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      toast(t('wc.advanced_hint'), 'err')
    } else {
      toast(e instanceof Error ? e.message : t('common.failed'), 'err')
    }
  } finally {
    refresh()
  }
}

function QuickBtn({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: JSX.Element
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button class="quick-btn" disabled={disabled} onClick={() => { tapFeedback(); onClick() }}>
      <span class="quick-icon">{icon}</span>
      <span class="quick-label">{label}</span>
    </button>
  )
}

/** Same wrapper as the 51DK path, for the car's own endpoints. */
async function run(fn: () => Promise<ControlResult>, ok: string) {
  try {
    toastResult(await fn(), ok)
  } catch (e) {
    toast(e instanceof Error ? e.message : t('common.failed'), 'err')
  } finally {
    refresh()
  }
}

/**
 * Row of 4 common actions under the car image.
 *
 * WHICH four depends on the WiCarlink setting, which is the whole point of that
 * setting — "replace vehicle controls with 51DK commands". This row used to
 * fire 51DK unconditionally, so with the kit switched off (or not installed at
 * all) every button here posted an `am start` for an app that isn't on the head
 * unit: nothing happened, or a 403 if advanced actions were off, while the same
 * four actions worked normally one tab over. Off means the car's own endpoints.
 *
 * There is no native remote start, so that slot becomes Flash — the nearest
 * useful thing the car will actually do — rather than a button that cannot work.
 */
export function QuickActions() {
  const disabled = !connected.value
  const wc51 = wicarlink.value
  return (
    <div class="quick-row">
      <QuickBtn
        icon={<IconLock size={22} />}
        label={t('ctrl.lock')}
        disabled={disabled}
        onClick={() => (wc51 ? fire('lock', t('ctrl.lock')) : run(api.lock, t('ctrl.lock')))}
      />
      <QuickBtn
        icon={<IconUnlock size={22} />}
        label={t('ctrl.unlock')}
        disabled={disabled}
        onClick={() => (wc51 ? fire('unlock', t('ctrl.unlock')) : run(api.unlock, t('ctrl.unlock')))}
      />
      {wc51 ? (
        <QuickBtn
          icon={<IconBolt size={22} />}
          label={t('ctrl.start')}
          disabled={disabled}
          onClick={() => fire('start', t('ctrl.start'))}
        />
      ) : (
        <QuickBtn
          icon={<IconBolt size={22} />}
          label={t('ctrl.flash')}
          disabled={disabled}
          onClick={() => run(api.flash, t('ctrl.flash'))}
        />
      )}
      <QuickBtn
        icon={<IconTrunk size={22} />}
        label={t('ctrl.trunk')}
        disabled={disabled}
        onClick={() => (wc51 ? fire('trunk', t('ctrl.trunk')) : run(() => api.setTrunk('open'), t('ctrl.trunk')))}
      />
    </div>
  )
}
