import * as api from '../lib/api'
import { connected, refresh, vehicleState } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { IconSnowSeat, IconThermo } from './icons'

const LEVELS = ['Off', 'Low', 'High'] // level 0, 1, 2

const SEATS: { pos: 1 | 2; name: string; idx: number }[] = [
  { pos: 1, name: 'Driver', idx: 0 },
  { pos: 2, name: 'Passenger', idx: 1 },
]

export function SeatClimate({ mode }: { mode: 'heat' | 'cool' }) {
  const seats = vehicleState.value?.seats
  // Cooling needs ventilated-seat hardware; heating is assumed available.
  if (mode === 'cool' && !seats?.ventilatedSupported) return null

  const disabled = !connected.value
  const levels = (mode === 'heat' ? seats?.heat : seats?.cool) || []
  const title = mode === 'heat' ? 'Seat heating' : 'Seat cooling'
  const Icon = mode === 'heat' ? IconThermo : IconSnowSeat

  async function set(position: 1 | 2, level: number) {
    try {
      const r = mode === 'heat' ? await api.setSeatHeat(position, level) : await api.setSeatVent(position, level)
      toastResult(r, `${position === 1 ? 'Driver' : 'Passenger'} ${mode === 'heat' ? 'heat' : 'cooling'} ${LEVELS[level]}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'err')
    } finally {
      refresh()
    }
  }

  return (
    <div class="card" style={{ marginTop: '14px' }}>
      <div class="card-title">{title}</div>
      {SEATS.map((s) => (
        <div class="seat-row" key={s.pos}>
          <span class="seat-name"><Icon size={20} /> {s.name}</span>
          <div class="seg">
            {LEVELS.map((lab, lvl) => (
              <button
                key={lvl}
                class={levels[s.idx] === lvl ? 'on' : ''}
                disabled={disabled}
                onClick={() => set(s.pos, lvl)}
              >
                {lab}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
