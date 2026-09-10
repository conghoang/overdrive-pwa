import { useEffect, useRef, useState } from 'preact/hooks'
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
/*
 * How long the user's own taps outrank the car's reported setpoint.
 *
 * The dial arrives on a 5s poll, and the car takes a moment to apply a change.
 * Without this the sequence "tap + to 25, poll returns the old 24" would snap
 * the stepper backwards under the user's finger. After it elapses the car wins
 * again — so a change the car never accepted is corrected rather than left
 * showing a number only the phone believes.
 */
const SETPOINT_SETTLE_MS = 4000

/**
 * Show a change straight away, and let the car correct it.
 *
 * Climate state only arrives on the 5s telemetry poll, and the car itself takes
 * a moment to apply a command — so tapping a fan speed left the bar sitting on
 * the old value for ten seconds or more, which reads as a dropped tap and
 * invites a second one.
 *
 * The optimistic value is held until the car agrees (it confirms, and the
 * override is dropped), the caller rolls it back (the command was rejected), or
 * the window lapses — so a change the car silently ignored corrects itself
 * instead of leaving the UI asserting something untrue indefinitely.
 */
const OPTIMISTIC_MS = 8000
function useOptimistic<T>(carValue: T) {
  const [pending, setPending] = useState<{ value: T; at: number } | null>(null)

  useEffect(() => {
    if (!pending) return
    if (carValue === pending.value) { setPending(null); return } // car agrees
    const left = OPTIMISTIC_MS - (Date.now() - pending.at)
    if (left <= 0) { setPending(null); return }
    const id = setTimeout(() => setPending(null), left)
    return () => clearTimeout(id)
  }, [carValue, pending])

  const shown = pending ? pending.value : carValue
  return {
    shown,
    predict: (v: T) => setPending({ value: v, at: Date.now() }),
    rollback: () => setPending(null),
  }
}

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

/** Returns whether the car accepted it, so an optimistic UI can be rolled back. */
async function run(fn: () => Promise<ControlResult>, okMsg: string): Promise<boolean> {
  try {
    return toastResult(await fn(), okMsg)
  } catch (e) {
    handleError(e)
    return false
  } finally {
    refresh()
  }
}

// Climate direct commands are fire-and-forget; a dormant car may only wake on the
// first send. Show feedback immediately, then re-send once so a sleeping car still
// acts — but skip the resend if a newer climate command has since been issued
// (so a quick ON→OFF can't be undone by ON's late resend).
async function runClimate(fn: () => Promise<ControlResult>, okMsg: string): Promise<boolean> {
  const gen = ++climateGen
  try {
    const ok = toastResult(await fn(), okMsg)
    void sleep(600).then(() => {
      if (gen === climateGen) fn().catch(() => {})
    })
    return ok
  } catch (e) {
    handleError(e)
    return false
  } finally {
    refresh()
  }
}

export function Controls() {
  /*
   * Seeded at 22 only until the car speaks. The setpoint (climate.setpointDriver)
   * arrived in OD v48; before that no client could read the dial, so this stayed
   * at its hardcoded default and a car set to 24 showed 22 in the app forever.
   */
  const [temp, setTemp] = useState(22)
  const lastEditAt = useRef(0)

  // WiCarlink mode swaps only the top remote-action buttons for 51DK commands.
  const wc = wicarlink.value

  const vs = vehicleState.value
  /*
   * Both of these are shown optimistically: the car reports them only on the
   * poll, so without this a tap sat visibly inert for seconds.
   */
  const ac = useOptimistic(!!(vs?.climate?.acOn || vs?.climate?.remoteClimateActive))
  const climateActive = ac.shown
  const fan = useOptimistic(vs?.climate?.fanLevel)
  const fanLevel = fan.shown
  const carSetpoint = vs?.climate?.setpointDriver
  /*
   * Refuse a setpoint we cannot render honestly. The value is expressed in the
   * head unit's display unit, and this stepper is labelled degC — so a
   * Fahrenheit car (tempUnit 0) is left alone rather than shown as if its 75
   * were Celsius. The range check also rejects sentinels.
   */
  const setpointUsable =
    carSetpoint != null &&
    vs?.climate?.tempUnit !== 0 &&
    carSetpoint >= TEMP_MIN &&
    carSetpoint <= TEMP_MAX
  const disabled = !connected.value

  useEffect(() => {
    if (!setpointUsable) return // absent while the car is off — keep the last known
    if (Date.now() - lastEditAt.current < SETPOINT_SETTLE_MS) return
    setTemp(carSetpoint as number)
  }, [carSetpoint, setpointUsable])

  function changeTemp(delta: number) {
    const nt = Math.min(TEMP_MAX, Math.max(TEMP_MIN, temp + delta))
    lastEditAt.current = Date.now() // this tap outranks the poll for a moment
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
            onClick={async () => {
              const next = !climateActive
              ac.predict(next)
              const ok = next
                ? await runClimate(() => api.climateOn(temp), `${t('ctrl.climate')} · ${temp}°C`)
                : await runClimate(api.climateOff, `${t('ctrl.climate')} · ${t('common.off')}`)
              if (!ok) ac.rollback() // never leave the toggle asserting a state the car refused
            }}
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
                onClick={async () => {
                  fan.predict(i + 1)
                  const ok = await run(() => api.setFan(i + 1), `${t('ctrl.fan')} ${i + 1}`)
                  if (!ok) fan.rollback()
                }}
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
