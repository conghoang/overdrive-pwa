import * as api from '../lib/api'
import { connected, refresh, vehicleState } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { IconSnowSeat } from './icons'

const LEVELS = ['Off', 'Low', 'High'] // level 0, 1, 2

export function SeatCooling() {
  const seats = vehicleState.value?.seats
  if (!seats?.ventilatedSupported) return null

  const disabled = !connected.value
  const cool = seats.cool || []

  async function set(position: 1 | 2, level: number) {
    try {
      const r = await api.setSeatVent(position, level)
      toastResult(r, `${position === 1 ? 'Driver' : 'Passenger'} cooling ${LEVELS[level]}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'err')
    } finally {
      refresh()
    }
  }

  const seatsList: { pos: 1 | 2; name: string; idx: number }[] = [
    { pos: 1, name: 'Driver', idx: 0 },
    { pos: 2, name: 'Passenger', idx: 1 },
  ]

  return (
    <div class="card" style={{ marginTop: '14px' }}>
      <div class="card-title">Seat cooling</div>
      {seatsList.map((s) => (
        <div class="seat-row" key={s.pos}>
          <span class="seat-name"><IconSnowSeat size={20} /> {s.name}</span>
          <div class="seg">
            {LEVELS.map((lab, lvl) => (
              <button
                key={lvl}
                class={cool[s.idx] === lvl ? 'on' : ''}
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
