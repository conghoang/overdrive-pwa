import * as api from '../lib/api'
import { connected, refresh, vehicleState } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { IconFlame, IconSnow } from './icons'

const LEVELS = ['Off', 'Low', 'High'] // 0, 1, 2

function Seg({
  value,
  tone,
  disabled,
  onSet,
}: {
  value: number
  tone: 'cool' | 'heat'
  disabled: boolean
  onSet: (level: number) => void
}) {
  return (
    <div class={'seg3 ' + tone}>
      {LEVELS.map((lab, lvl) => (
        <button key={lvl} class={value === lvl ? 'on' : ''} disabled={disabled} onClick={() => onSet(lvl)}>
          {lab}
        </button>
      ))}
    </div>
  )
}

const COLS: { pos: 1 | 2; name: string; idx: number }[] = [
  { pos: 1, name: 'Driver', idx: 0 },
  { pos: 2, name: 'Passenger', idx: 1 },
]

/** Two side-by-side seat cards (Driver / Passenger), each with Cooling + Heating. */
export function Seats() {
  const seats = vehicleState.value?.seats
  const disabled = !connected.value
  const heat = seats?.heat || []
  const cool = seats?.cool || []
  const canCool = !!seats?.ventilatedSupported

  async function set(kind: 'heat' | 'cool', pos: 1 | 2, level: number) {
    const who = pos === 1 ? 'Driver' : 'Passenger'
    try {
      const r = kind === 'heat' ? await api.setSeatHeat(pos, level) : await api.setSeatVent(pos, level)
      toastResult(r, `${who} ${kind === 'heat' ? 'heat' : 'cooling'} ${LEVELS[level]}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'err')
    } finally {
      refresh()
    }
  }

  return (
    <div class="card">
      <div class="seats-grid">
        {COLS.map((c) => (
          <div class="seat-col" key={c.pos}>
            <div class="seat-col-title">{c.name}</div>
            {canCool && (
              <div class="seat-mode">
                <div class="seat-mode-label cool"><IconSnow size={15} /> Cooling</div>
                <Seg value={cool[c.idx] ?? 0} tone="cool" disabled={disabled} onSet={(l) => set('cool', c.pos, l)} />
              </div>
            )}
            <div class="seat-mode">
              <div class="seat-mode-label heat"><IconFlame size={15} /> Heating</div>
              <Seg value={heat[c.idx] ?? 0} tone="heat" disabled={disabled} onSet={(l) => set('heat', c.pos, l)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
