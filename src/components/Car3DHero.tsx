import { useEffect, useRef } from 'preact/hooks'
import { effect } from '@preact/signals'
import { status, vehicleState } from '../lib/store'
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
  destroy(): void
}
interface NeoHero { mountHero(stage: Element, opts: Record<string, unknown>): HeroHandle }

/** Every state key the hero's mapping reads — used both by the adapter and the diff. */
const KEYS = [
  'power.acc', 'power.gear', 'meta.color', 'meta.driveSide',
  'doors.lf', 'doors.rf', 'doors.lr', 'doors.rr', 'doors.hood', 'doors.trunk', 'doors.fuel',
  'windows.lf', 'windows.rf', 'windows.lr', 'windows.rr', 'windows.sunroof', 'windows.shade',
  'mirrors.folded', 'climate.on',
  'charge.active', 'charge.plugged', 'charge.kw', 'charge.full', 'charge.fault', 'charge.v2l',
  'lights.low', 'lights.high', 'lights.hazard', 'lights.drl',
  'lock.driver', 'lock.doors.lf', 'lock.doors.rf', 'lock.doors.lr', 'lock.doors.rr', 'lock.scope',
]

/** Map our live telemetry onto the hero's dotted-key store. null = unknown = neutral. */
function readState(path: string): unknown {
  const s = status.value
  const vs = vehicleState.value
  const d = vs?.doorOpen
  const w = vs?.windows
  const l = vs?.lights
  const beam = (x: number | undefined) => (typeof x === 'number' ? x > 0 : null)
  const pct = (x: number | undefined) => (typeof x === 'number' && x >= 0 ? x : null)
  const locked = vs?.doors?.overall === 1 ? true : vs?.doors?.overall === 2 ? false : null
  switch (path) {
    case 'power.acc': return typeof s?.acc === 'boolean' ? s.acc : null
    case 'power.gear': return 'P'
    case 'meta.color': return '#E8E8EC' // Aurora White
    case 'meta.driveSide': return 'lhd'
    case 'climate.on': return vs?.climate?.acOn ?? null
    case 'charge.active': return s?.charging?.charging ?? null
    case 'charge.plugged': return s?.charging?.plugged ?? null
    case 'charge.kw': { const kw = (s?.charging as { kw?: number } | undefined)?.kw; return typeof kw === 'number' ? kw : null }
    case 'charge.full': case 'charge.fault': case 'charge.v2l': return null
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
    case 'mirrors.folded': return null
    case 'lights.low': return beam(l?.lowBeam)
    case 'lights.high': return beam(l?.highBeam)
    case 'lights.hazard': return beam(l?.hazard)
    case 'lights.drl': return beam(l?.dayTimeLight)
    case 'lock.driver':
    case 'lock.doors.lf': case 'lock.doors.rf': case 'lock.doors.lr': case 'lock.doors.rr':
      return locked
    case 'lock.scope': return 'all'
    default: return null
  }
}

function webgl2(): boolean {
  return typeof (globalThis as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext === 'function'
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
    const base = import.meta.env.BASE_URL
    const read: Read = (p) => (p === 'meta.modelId' ? 'seal-u-dmi' : readState(p))

    import(/* @vite-ignore */ `${base}neo3d/3d/hero.js`)
      .then((m: NeoHero) => {
        if (destroyed || !hostRef.current) return
        handle = m.mountHero(stage, {
          read,
          modelUrl: `${base}neo3d/models/sealion6.glb`,
          eligible: () => true, // we only ship this one model
          light: false, // the hero palette we vendored is dark
          t: (k: string) => k,
          fmt: {
            kw: (x: number) => (typeof x === 'number' && isFinite(x) ? x.toFixed(1) + ' kW' : '--'),
            pressure: (x: number) => (typeof x === 'number' && isFinite(x) ? String(Math.round(x)) : '--'),
          },
          onReady: (kind: string) => { if (kind !== '3d' && !destroyed) onFallback() },
        })

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
      })
      .catch(() => { if (!destroyed) onFallback() })

    return () => {
      destroyed = true
      disposeEffect?.()
      try { handle?.destroy() } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={hostRef} class="car3d-host" role="img" aria-label="3D car" />
}
