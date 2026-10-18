import { useEffect, useRef } from 'preact/hooks'
import { effect } from '@preact/signals'
import { status, vehicleState } from '../lib/store'
import { car3dColor, carName } from '../lib/settings'
import { tyreSeverity } from '../lib/tyres'
import { fmtPressure, pressureUnitLabel } from '../lib/format'
import { lang } from '../lib/i18n'
import './car3d.css'

/*
 * The "Neo" 3D car hero, vendored under public/neo3d (three.js + a Sealion 6
 * glTF with authored door/hood/tailgate/window/light animations). It's loaded
 * lazily at runtime — `import()` of a /public asset, kept out of the bundle —
 * and driven by a thin adapter that maps our telemetry to the flat dotted-key
 * store the hero's mapping.js reads (doors.lf, power.acc, charge.active, …).
 *
 * `onFallback` fires when 3D isn't possible (no WebGL2, model/load failure):
 * the parent then shows the still photo instead.
 */

type Read = (path: string) => unknown
interface HeroHandle {
  update(changed: string[]): void
  setTheme(light: boolean): void
  setPlate(text: string): void
  /** Resolves with the live kind once no 3D load is in flight: '3d' on success, '2d' on failure. */
  whenIdle(): Promise<string>
  destroy(): void
}
interface NeoHero { mountHero(stage: Element, opts: Record<string, unknown>): HeroHandle }

/*
 * The hero labels everything through its own i18n keys (ph.act.* captions,
 * part.* / win.* / lights.* part names, ph.home.* pins, chrome). The app's
 * string table doesn't carry those keys, so the hero keeps its own small
 * catalog — now in both languages, picked by the app's `lang` so Vietnamese
 * users see Vietnamese captions. Anything unmapped blanks out so no raw key
 * leaks through, and {p}/{n}/{g} are interpolated.
 */
const HERO_EN: Record<string, string> = {
  'ph.hero3d_loading': '', 'ph.hero3d_reset': 'Reset view',
  'ph.home.pin_open': '{p} open', 'ph.home.pin_tyre': 'Check tyre',
  'neo.home.act_on': 'Ready to drive',
  // part names
  'part.lf': 'Front-left door', 'part.rf': 'Front-right door', 'part.lr': 'Rear-left door', 'part.rr': 'Rear-right door',
  'part.hood': 'Hood', 'part.trunk': 'Tailgate', 'part.fuel': 'Fuel flap',
  'win.lf': 'Front-left window', 'win.rf': 'Front-right window', 'win.lr': 'Rear-left window', 'win.rr': 'Rear-right window',
  'win.sunroof': 'Sunroof', 'ph.act.part.shade': 'Sunshade',
  'lights.low': 'Low beam', 'lights.high': 'High beam', 'lights.turnL': 'Left signal', 'lights.turnR': 'Right signal', 'lights.hazard': 'Hazards',
  // caption actions
  'ph.act.open': '{p} open', 'ph.act.close': '{p} closed',
  'ph.act.win_down': '{p} down', 'ph.act.win_up': '{p} up',
  'ph.act.locked': 'Locked', 'ph.act.unlocked': 'Unlocked',
  'ph.act.start': 'Ready to drive', 'ph.act.stop': 'Off',
  'ph.act.acc_on': 'Switched on', 'ph.act.acc_off': 'Switched off',
  'ph.act.reverse': 'Reverse', 'ph.act.gear': 'Gear {g}',
  'ph.act.mirror_fold': 'Mirrors folded', 'ph.act.mirror_unfold': 'Mirrors open',
  'ph.act.on': '{p} on', 'ph.act.off': '{p} off',
  'ph.act.ac_on': 'Climate on', 'ph.act.ac_off': 'Climate off',
  'ph.act.charge_start': 'Charging', 'ph.act.charge_stop': 'Charging stopped',
  'ph.act.plugged': 'Plugged in', 'ph.act.unplugged': 'Unplugged',
  'ph.act.doors_open': '{n} doors open', 'ph.act.doors_close': '{n} doors closed', 'ph.act.doors_mixed': '{n} doors',
  'ph.act.more': '+{n} more', 'ph.act.many': '{n} changes', 'ph.act.flash': 'Flashed',
}
const HERO_VI: Record<string, string> = {
  'ph.hero3d_loading': '', 'ph.hero3d_reset': 'Đặt lại góc nhìn',
  'ph.home.pin_open': '{p} đang mở', 'ph.home.pin_tyre': 'Kiểm tra lốp',
  'neo.home.act_on': 'Sẵn sàng lái',
  'part.lf': 'Cửa trước trái', 'part.rf': 'Cửa trước phải', 'part.lr': 'Cửa sau trái', 'part.rr': 'Cửa sau phải',
  'part.hood': 'Nắp ca-pô', 'part.trunk': 'Cốp', 'part.fuel': 'Nắp xăng',
  'win.lf': 'Kính trước trái', 'win.rf': 'Kính trước phải', 'win.lr': 'Kính sau trái', 'win.rr': 'Kính sau phải',
  'win.sunroof': 'Cửa sổ trời', 'ph.act.part.shade': 'Rèm che',
  'lights.low': 'Đèn cốt', 'lights.high': 'Đèn pha', 'lights.turnL': 'Xi-nhan trái', 'lights.turnR': 'Xi-nhan phải', 'lights.hazard': 'Đèn khẩn cấp',
  'ph.act.open': '{p} đã mở', 'ph.act.close': '{p} đã đóng',
  'ph.act.win_down': '{p} hạ xuống', 'ph.act.win_up': '{p} đã đóng',
  'ph.act.locked': 'Đã khóa', 'ph.act.unlocked': 'Đã mở khóa',
  'ph.act.start': 'Sẵn sàng lái', 'ph.act.stop': 'Đã tắt',
  'ph.act.acc_on': 'Đã bật', 'ph.act.acc_off': 'Đã tắt',
  'ph.act.reverse': 'Lùi', 'ph.act.gear': 'Số {g}',
  'ph.act.mirror_fold': 'Gập gương', 'ph.act.mirror_unfold': 'Mở gương',
  'ph.act.on': 'Bật {p}', 'ph.act.off': 'Tắt {p}',
  'ph.act.ac_on': 'Bật điều hòa', 'ph.act.ac_off': 'Tắt điều hòa',
  'ph.act.charge_start': 'Đang sạc', 'ph.act.charge_stop': 'Dừng sạc',
  'ph.act.plugged': 'Đã cắm sạc', 'ph.act.unplugged': 'Đã rút sạc',
  'ph.act.doors_open': 'Mở {n} cửa', 'ph.act.doors_close': 'Đóng {n} cửa', 'ph.act.doors_mixed': '{n} cửa',
  'ph.act.more': '+{n} nữa', 'ph.act.many': '{n} thay đổi', 'ph.act.flash': 'Nháy đèn',
}
const heroT = (k: string, p?: Record<string, unknown>) => {
  const table = lang.value === 'vi' ? HERO_VI : HERO_EN
  let s = k in table ? table[k] : ''
  if (p) for (const [key, val] of Object.entries(p)) s = s.replace('{' + key + '}', String(val))
  return s
}

/** Every state key the hero's mapping reads — used both by the adapter and the diff. */
const KEYS = [
  'power.acc', 'power.gear', 'meta.color', 'meta.driveSide',
  'doors.lf', 'doors.rf', 'doors.lr', 'doors.rr', 'doors.hood', 'doors.trunk', 'doors.fuel',
  'windows.lf', 'windows.rf', 'windows.lr', 'windows.rr', 'windows.sunroof', 'windows.shade',
  'mirrors.folded', 'climate.on',
  'charge.active', 'charge.plugged', 'charge.kw', 'charge.kwShown', 'charge.full', 'charge.fault', 'energy.socPct',
  'lights.low', 'lights.high', 'lights.hazard', 'lights.drl',
  'lock.driver', 'lock.doors.lf', 'lock.doors.rf', 'lock.doors.lr', 'lock.doors.rr', 'lock.scope',
  // A tyre pin shows only for an abnormal corner (warn/alert); kPa feeds its label.
  'tyres.fl.warn', 'tyres.fr.warn', 'tyres.rl.warn', 'tyres.rr.warn',
  'tyres.fl.kPa', 'tyres.fr.kPa', 'tyres.rl.kPa', 'tyres.rr.kPa',
]

/** Map our live telemetry onto the hero's dotted-key store. null = unknown = neutral. */
function readState(path: string): unknown {
  const s = status.value
  const vs = vehicleState.value
  const d = vs?.doorOpen
  const w = vs?.windows
  const l = vs?.lights
  const ty = vs?.tyres
  const beam = (x: number | undefined) => (typeof x === 'number' ? x > 0 : null)
  const pct = (x: number | undefined) => (typeof x === 'number' && x >= 0 ? x : null)
  const locked = vs?.doors?.overall === 1 ? true : vs?.doors?.overall === 2 ? false : null
  switch (path) {
    case 'power.acc': return typeof s?.acc === 'boolean' ? s.acc : null
    case 'power.gear': return 'P'
    case 'meta.color': return car3dColor.value // reading the signal here lets the update effect track colour changes
    case 'meta.driveSide': return 'lhd'
    case 'climate.on': return vs?.climate?.acOn ?? null
    case 'charge.active': return s?.charging?.charging ?? null
    case 'charge.plugged': return s?.charging?.plugged ?? null
    case 'charge.kw': { const kw = s?.charging?.powerKw ?? s?.charging?.chargingPowerKW; return typeof kw === 'number' ? kw : null }
    // The hero shows its kW label only when kwShown is true and kW > 0.
    case 'charge.kwShown': { const kw = s?.charging?.powerKw ?? s?.charging?.chargingPowerKW; return s?.charging?.charging === true && typeof kw === 'number' && kw > 0 }
    case 'energy.socPct': return typeof s?.soc?.percent === 'number' ? s.soc.percent : null
    case 'charge.full': return s?.charging?.full ?? null
    case 'charge.fault': return s?.charging?.fault ?? null
    case 'charge.est': case 'charge.targetPct': case 'charge.v2l': return null
    case 'doors.lf': return d?.lf ?? null
    case 'doors.rf': return d?.rf ?? null
    case 'doors.lr': return d?.lr ?? null
    case 'doors.rr': return d?.rr ?? null
    case 'doors.hood': return d?.hood ?? null
    case 'doors.trunk': return d?.trunk ?? null
    case 'doors.fuel': return null
    case 'windows.lf': return pct(w?.lf)
    case 'windows.rf': return pct(w?.rf)
    case 'windows.lr': return pct(w?.lr)
    case 'windows.rr': return pct(w?.rr)
    case 'windows.sunroof': return pct(w?.sunroof)
    case 'windows.shade': return pct(w?.sunshade)
    // The car folds its mirrors when it locks and opens them on unlock. Telemetry
    // carries no fold read-back, so we mirror the lock state: locked = folded,
    // unlocked = open, unknown = leave them open (null = neutral).
    case 'mirrors.folded': return locked
    case 'lights.low': return beam(l?.lowBeam)
    case 'lights.high': return beam(l?.highBeam)
    case 'lights.hazard': return beam(l?.hazard)
    case 'lights.drl': return beam(l?.dayTimeLight)
    case 'lock.driver':
    case 'lock.doors.lf': case 'lock.doors.rf': case 'lock.doors.lr': case 'lock.doors.rr':
      return locked
    case 'lock.scope': return 'all'
    // Tyres: the hero pins a corner only when `warn` is true, so flag abnormal
    // ('warn'/'alert') corners — a low/over/critical reading or a leak. 'muted'
    // (no data / no signal) and 'normal' leave the corner unpinned. The pin's
    // label reads tyres.<w>.kPa through fmt.pressure.
    case 'tyres.fl.warn': { const sev = tyreSeverity(ty?.fl, true, ty?.limits); return sev === 'warn' || sev === 'alert' }
    case 'tyres.fr.warn': { const sev = tyreSeverity(ty?.fr, true, ty?.limits); return sev === 'warn' || sev === 'alert' }
    case 'tyres.rl.warn': { const sev = tyreSeverity(ty?.rl, false, ty?.limits); return sev === 'warn' || sev === 'alert' }
    case 'tyres.rr.warn': { const sev = tyreSeverity(ty?.rr, false, ty?.limits); return sev === 'warn' || sev === 'alert' }
    case 'tyres.fl.kPa': return typeof ty?.fl?.kPa === 'number' ? ty.fl.kPa : null
    case 'tyres.fr.kPa': return typeof ty?.fr?.kPa === 'number' ? ty.fr.kPa : null
    case 'tyres.rl.kPa': return typeof ty?.rl?.kPa === 'number' ? ty.rl.kPa : null
    case 'tyres.rr.kPa': return typeof ty?.rr?.kPa === 'number' ? ty.rr.kPa : null
    default: return null
  }
}

function webgl2(): boolean {
  return typeof (globalThis as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext === 'function'
}

/*
 * The hero's badges/buttons render glyphs as <use href="#i-lock"> into an inline
 * SVG symbol sprite. Inject that sprite (once) so the references resolve — without
 * it the lock/charge/recenter icons are empty and only their dark pills show.
 */
let spriteLoading: Promise<void> | null = null
function ensureSprite(base: string): Promise<void> {
  if (document.getElementById('neo3d-sprite')) return Promise.resolve()
  if (spriteLoading) return spriteLoading
  spriteLoading = fetch(`${base}neo3d/icons.svg`)
    .then((r) => (r.ok ? r.text() : ''))
    .then((svg) => {
      if (!svg || document.getElementById('neo3d-sprite')) return
      const wrap = document.createElement('div')
      wrap.id = 'neo3d-sprite'
      wrap.setAttribute('aria-hidden', 'true')
      wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
      wrap.innerHTML = svg
      document.body.appendChild(wrap)
    })
    .catch(() => { /* icons just won't render; not fatal */ })
  return spriteLoading
}

export function Car3DHero({ onFallback }: { onFallback: () => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const stage = hostRef.current
    if (!stage) return
    if (!webgl2()) { onFallback(); return }

    let destroyed = false
    let handle: HeroHandle | null = null
    let disposeEffect: (() => void) | null = null
    let disposePlate: (() => void) | null = null
    const base = import.meta.env.BASE_URL
    const read: Read = (p) => (p === 'meta.modelId' ? 'seal-u-dmi' : readState(p))

    Promise.all([
      import(/* @vite-ignore */ `${base}neo3d/3d/hero.js`),
      ensureSprite(base), // in place before mountHero builds its badges
    ])
      .then(([m]: [NeoHero, void]) => {
        if (destroyed || !hostRef.current) return
        handle = m.mountHero(stage, {
          read,
          modelUrl: `${base}neo3d/models/sealion6.glb`,
          eligible: () => true, // we only ship this one model
          light: false, // the hero palette we vendored is dark
          fit: 1.2, // frame the car a little tighter so it fills the (taller) hero
          plate: carName.value, // custom plates (front + rear) show the car's name
          t: heroT,
          fmt: {
            kw: (x: number) => (typeof x === 'number' && isFinite(x) ? x.toFixed(1) + ' kW' : '--'),
            // The hero hands us the corner's kPa; show it in the user's pressure
            // unit with its label (e.g. "180 kPa", "26.1 psi", "1.80 bar").
            pressure: (x: number) => {
              if (typeof x !== 'number' || !isFinite(x)) return '--'
              const unit = status.value?.pressureUnit || 'kpa'
              return `${fmtPressure({ kPa: x, available: true }, unit)} ${pressureUnitLabel(unit)}`
            },
          },
        })

        // Fall back to the photo only when the 3D attempt actually settles on
        // 2D. We can't key off onReady — the hero paints a (here empty) 2D base
        // layer and reports '2d' *before* the model loads; whenIdle() resolves
        // with the real outcome, '3d' once the first frame renders.
        handle.whenIdle().then((kind) => { if (kind !== '3d' && !destroyed) onFallback() })

        // Push live telemetry: diff the mapped keys on every signal change and
        // hand the hero only what changed, so it animates just those parts.
        const snap: Record<string, unknown> = {}
        for (const k of KEYS) snap[k] = read(k)
        disposeEffect = effect(() => {
          void status.value; void vehicleState.value // track both signals
          const changed: string[] = []
          for (const k of KEYS) {
            const v = read(k)
            if (v !== snap[k]) { snap[k] = v; changed.push(k) }
          }
          if (changed.length && handle) { try { handle.update(changed) } catch { /* ignore */ } }
        })

        // Keep the plates in sync with the car name.
        disposePlate = effect(() => {
          const name = carName.value
          if (handle) { try { handle.setPlate(name) } catch { /* ignore */ } }
        })
      })
      .catch(() => { if (!destroyed) onFallback() })

    return () => {
      destroyed = true
      disposeEffect?.()
      disposePlate?.()
      try { handle?.destroy() } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={hostRef} class="car3d-host" role="img" aria-label="3D car" />
}
