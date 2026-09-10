import { useState } from 'preact/hooks'
import * as api from '../lib/api'
import { AuthError } from '../lib/api'
import { authLost, cloudConfigured, connected, refresh, vehicleState } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import type { ControlResult } from '../lib/types'
import { ActionButton } from '../components/HoldButton'
import {
  IconBell,
  IconBolt,
  IconLock,
  IconMinus,
  IconPlus,
  IconTrunk,
  IconUnlock,
  IconWind,
} from '../components/icons'
import { wicarlink } from '../lib/settings'
import { t } from '../lib/i18n'
import { WiCarlinkGrid } from '../components/WiCarlinkControls'
import { Seats } from '../components/Seats'
import { ClimateBanner } from '../components/ClimateBanner'
import { AppHeader } from '../components/AppHeader'
import '../components/controls.css'

const TEMP_MIN = 16
const TEMP_MAX = 30

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Bumped on every climate command so a stale wake-resend can cancel itself.
let climateGen = 0

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    authLost.value = true // drop straight to the setup screen instead of a cryptic toast
    return
  }
  toast(e instanceof Error ? e.message : t('common.failed'), 'err')
}

async function run(fn: () => Promise<ControlResult>, okMsg: string) {
  try {
    toastResult(await fn(), okMsg)
  } catch (e) {
    handleError(e)
  } finally {
    refresh()
  }
}

// Climate direct commands are fire-and-forget; a dormant car may only wake on the
// first send. Show feedback immediately, then re-send once so a sleeping car still
// acts — but skip the resend if a newer climate command has since been issued
// (so a quick ON→OFF can't be undone by ON's late resend).
async function runClimate(fn: () => Promise<ControlResult>, okMsg: string) {
  const gen = ++climateGen
  try {
    toastResult(await fn(), okMsg)
    void sleep(600).then(() => {
      if (gen === climateGen) fn().catch(() => {})
    })
  } catch (e) {
    handleError(e)
  } finally {
    refresh()
  }
}

export function Controls() {
  const [temp, setTemp] = useState(22)

  // WiCarlink mode swaps only the top remote-action buttons for 51DK commands.
  const wc = wicarlink.value

  const vs = vehicleState.value
  const climateActive = !!(vs?.climate?.acOn || vs?.climate?.remoteClimateActive)
  const fanLevel = vs?.climate?.fanLevel
  const disabled = !connected.value

  function changeTemp(delta: number) {
    const nt = Math.min(TEMP_MAX, Math.max(TEMP_MIN, temp + delta))
    setTemp(nt)
    /*
     * runClimate, not run: setting the temperature IS a climate command, so it
     * has to take the generation with it. It went through plain run() before,
     * which left climateGen untouched — so turning the AC on at 22° and then
     * tapping + inside the 600 ms window let the ON resend fire climateOn(22)
     * and put the car back to 22, while the stepper kept showing 24 with no way
     * to notice. Owning the generation also gets the temp its own wake-resend.
     */
    if (climateActive) runClimate(() => api.setClimateTemp(nt), t('ctrl.set_temp', { temp: nt }))
  }

  return (
    <div class="screen">
      <AppHeader title={t('tab.controls')} sub={disabled ? t('common.reconnecting') : t('common.ready')} dot={disabled ? 'wait' : 'ok'} />

      {/* remote actions — 51DK commands in WiCarlink mode; otherwise the BYD
          Cloud buttons, hidden entirely when BYD Cloud isn't configured. */}
      {wc ? (
        <WiCarlinkGrid />
      ) : cloudConfigured.value === false ? null : (
        <div class="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <ActionButton
            label={t('ctrl.lock')}
            tone="accent"
            icon={<IconLock size={26} />}
            disabled={disabled}
            onFire={() => run(api.lock, t('ctrl.lock'))}
          />
          <ActionButton
            label={t('ctrl.unlock')}
            tone="danger"
            hold
            icon={<IconUnlock size={26} />}
            disabled={disabled}
            onFire={() => run(api.unlock, t('ctrl.unlock'))}
          />
          <ActionButton
            label={t('ctrl.flash')}
            icon={<IconBolt size={26} />}
            disabled={disabled}
            onFire={() => run(api.flash, t('ctrl.flash'))}
          />
          <ActionButton
            label={t('ctrl.find')}
            icon={<IconBell size={26} />}
            disabled={disabled}
            onFire={() => run(api.findCar, t('ctrl.find'))}
          />
          <ActionButton
            label={t('ctrl.trunk')}
            hold
            icon={<IconTrunk size={26} />}
            disabled={disabled}
            onFire={() => run(() => api.setTrunk('open'), t('ctrl.trunk'))}
          />
        </div>
      )}

      {/* climate */}
      <div class="card" style={{ marginTop: '14px' }}>
        <ClimateBanner active={climateActive} fanLevel={fanLevel} />
        <div class="spread">
          <div class="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <IconWind size={15} /> {t('ctrl.climate')}
          </div>
          <button
            class={'climate-toggle' + (climateActive ? ' on' : '')}
            disabled={disabled}
            aria-pressed={climateActive}
            onClick={() =>
              climateActive
                ? runClimate(api.climateOff, `${t('ctrl.climate')} · ${t('common.off')}`)
                : runClimate(() => api.climateOn(temp), `${t('ctrl.climate')} · ${temp}°C`)
            }
          >
            {climateActive ? t('common.on') : t('common.off')}
          </button>
        </div>

        <div class="stepper" style={{ justifyContent: 'space-between', margin: '20px 0 18px' }}>
          <button disabled={disabled || temp <= TEMP_MIN} onClick={() => changeTemp(-1)}>
            <IconMinus size={22} />
          </button>
          <div class="climate-temp mono">
            {temp}
            <small>°C</small>
          </div>
          <button disabled={disabled || temp >= TEMP_MAX} onClick={() => changeTemp(1)}>
            <IconPlus size={22} />
          </button>
        </div>

        <div class="climate-fan">
          <button class="btn climate-auto" disabled={disabled} onClick={() => run(() => api.setClimateAuto(true), t('ctrl.auto_mode'))}>
            {t('ctrl.auto')}
          </button>
          {/* A row of seven bars whose only difference is colour. Without the
              radio semantics a screen reader hears seven identical buttons and
              cannot tell which level is set — and neither can anyone reading
              the fill by hue alone. */}
          <div class="fan-bar" role="radiogroup" aria-label={t('ctrl.fan')}>
            {Array.from({ length: 7 }).map((_, i) => (
              <button
                key={i}
                class={'fan-seg' + ((fanLevel ?? 0) > i ? ' on' : '')}
                disabled={disabled}
                role="radio"
                aria-checked={fanLevel === i + 1}
                aria-label={`${t('ctrl.fan')} ${i + 1}`}
                onClick={() => run(() => api.setFan(i + 1), `${t('ctrl.fan')} ${i + 1}`)}
              />
            ))}
          </div>
          <div class="fan-num">{t('ctrl.fan')} <b>{fanLevel ?? '–'}</b></div>
        </div>
      </div>

      {/* windows — all three route through the head unit's local SDK, so they
          work with no BYD Cloud account (see api.ventWindows). */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">{t('ctrl.windows')}</div>
        <div class="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <button class="btn" disabled={disabled} onClick={() => run(api.ventWindows, t('ctrl.vent'))}>
            {t('ctrl.vent')}
          </button>
          <button class="btn" disabled={disabled} onClick={() => run(api.openAllWindows, t('ctrl.open_all'))}>
            {t('ctrl.open_all')}
          </button>
          <button class="btn" disabled={disabled} onClick={() => run(api.closeAllWindows, t('ctrl.close_all'))}>
            {t('ctrl.close_all')}
          </button>
        </div>
      </div>

      <Seats />
    </div>
  )
}
