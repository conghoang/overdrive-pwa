import type { JSX } from 'preact'
import * as api from '../lib/api'
import { ApiError, AuthError } from '../lib/api'
import type { ControlResult } from '../lib/types'
import { authLost, cloudConfigured, connected, refresh } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { t } from '../lib/i18n'
import { wicarlink } from '../lib/settings'
import { useHold } from './HoldButton'
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
  hold,
  onFire,
}: {
  icon: JSX.Element
  label: string
  disabled: boolean
  /** Press-and-hold, for actions that physically open the car. */
  hold?: boolean
  onFire: () => void | Promise<void>
}) {
  const { busy, progress, handlers } = useHold(onFire, !!hold, disabled)
  return (
    <button class="quick-btn" disabled={disabled || busy} {...handlers}>
      {hold && progress > 0 && (
        <span class="quick-fill" style={{ transform: `scaleX(${progress})` }} />
      )}
      <span class="quick-icon">{icon}</span>
      <span class="quick-label">{label}</span>
      {hold && <span class="quick-hint">{t('ctrl.hold')}</span>}
    </button>
  )
}

/**
 * Same wrapper as the 51DK path, for the car's own endpoints.
 *
 * AuthError has to go to the store, not to a toast: it means the session is
 * gone, and the app's answer to that is the sign-in screen, not an untranslated
 * "Unauthorized" bubble over a dashboard that no longer works.
 */
async function run(fn: () => Promise<ControlResult>, ok: string) {
  try {
    toastResult(await fn(), ok)
  } catch (e) {
    if (e instanceof AuthError) authLost.value = true
    else toast(e instanceof Error ? e.message : t('common.failed'), 'err')
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
 *
 * Unlock and Trunk are hold-to-fire here for the same reason they are on the
 * Controls tab: they physically open the car, and this row sits directly under
 * the car photo where a mis-swipe lands. The 51DK path keeps plain taps — those
 * commands go to the kit's own app, which does its own confirmation.
 */
export function QuickActions() {
  const disabled = !connected.value
  /*
   * Which command set this row fires — it is never hidden.
   *
   * The kit's toggle decides when it is on. When it is off these are BYD Cloud
   * endpoints, so a car with no cloud account has 51DK as the only route that
   * can do anything — which is exactly what this row did for those users
   * before. An earlier version hid the row entirely in that case, and since
   * the toggle DEFAULTS to off, that silently deleted the card for everyone
   * without a cloud account, including people whose kit worked fine. Losing a
   * card you use is worse than a button that reports it could not run.
   */
  const wc51 = wicarlink.value || cloudConfigured.value === false
  return (
    <div class="quick-row">
      <QuickBtn
        icon={<IconLock size={22} />}
        label={t('ctrl.lock')}
        disabled={disabled}
        onFire={() => (wc51 ? fire('lock', t('ctrl.lock')) : run(api.lock, t('ctrl.lock')))}
      />
      <QuickBtn
        icon={<IconUnlock size={22} />}
        label={t('ctrl.unlock')}
        disabled={disabled}
        hold={!wc51}
        onFire={() => (wc51 ? fire('unlock', t('ctrl.unlock')) : run(api.unlock, t('ctrl.unlock')))}
      />
      {wc51 ? (
        <QuickBtn
          icon={<IconBolt size={22} />}
          label={t('ctrl.start')}
          disabled={disabled}
          onFire={() => fire('start', t('ctrl.start'))}
        />
      ) : (
        <QuickBtn
          icon={<IconBolt size={22} />}
          label={t('ctrl.flash')}
          disabled={disabled}
          onFire={() => run(api.flash, t('ctrl.flash'))}
        />
      )}
      <QuickBtn
        icon={<IconTrunk size={22} />}
        label={t('ctrl.trunk')}
        disabled={disabled}
        hold={!wc51}
        onFire={() => (wc51 ? fire('trunk', t('ctrl.trunk')) : run(() => api.setTrunk('open'), t('ctrl.trunk')))}
      />
    </div>
  )
}
