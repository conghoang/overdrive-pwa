import { fmtPressure, pressureUnitLabel } from '../lib/format'
import type { TyreCorner, TyresState } from '../lib/types'

// pressureState / airLeakState: 0 = normal, anything else = attention
function abnormal(t: TyreCorner | undefined): boolean {
  if (!t) return false
  return (t.pressureState ?? 0) !== 0 || (t.airLeakState ?? 0) !== 0
}

const CORNERS: { key: keyof TyresState; name: string }[] = [
  { key: 'fl', name: 'Front L' },
  { key: 'fr', name: 'Front R' },
  { key: 'rl', name: 'Rear L' },
  { key: 'rr', name: 'Rear R' },
]

export function Tyres({ tyres, unit }: { tyres: TyresState | undefined; unit: string }) {
  const available = !!tyres?.available
  return (
    <div class="card">
      <div class="card-title">Tyre pressure</div>
      {available ? (
        <div class="tyre-grid">
          {CORNERS.map((c) => {
            const t = tyres?.[c.key] as TyreCorner | undefined
            const warn = abnormal(t)
            return (
              <div class={'tyre' + (warn ? ' warn' : '')} key={c.key}>
                <div class="tyre-name">{c.name}</div>
                <div class="tyre-val mono">
                  {fmtPressure(t, unit)}
                  <small> {pressureUnitLabel(unit)}</small>
                </div>
                {t?.temperatureC != null && <div class="tyre-temp">{Math.round(t.temperatureC)}°C</div>}
              </div>
            )
          })}
        </div>
      ) : (
        <div class="screen-sub">Unavailable — start the car to read TPMS.</div>
      )}
    </div>
  )
}
