import * as api from '../lib/api'
import { connected, refresh, vehicleState } from '../lib/store'
import { toast, toastResult } from '../lib/toast'
import { t } from '../lib/i18n'
import { IconFlame, IconSnow } from './icons'

function levelLabels() {
  return [t('level.off'), t('level.low'), t('level.high')]
}

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
      {levelLabels().map((lab, lvl) => (
        <button key={lvl} class={value === lvl ? 'on' : ''} disabled={disabled} onClick={() => onSet(lvl)}>
          {lab}
        </button>
      ))}
    </div>
  )
}

const COLS: { pos: 1 | 2; key: string; idx: number }[] = [
  { pos: 1, key: 'seat.driver', idx: 0 },
  { pos: 2, key: 'seat.passenger', idx: 1 },
]

/** Two side-by-side seat cards (Driver / Passenger), each with Cooling + Heating. */
export function Seats() {
  const seats = vehicleState.value?.seats
  const disabled = !connected.value
  const heat = seats?.heat || []
  const cool = seats?.cool || []
  const canCool = !!seats?.ventilatedSupported

  async function set(kind: 'heat' | 'cool', pos: 1 | 2, level: number) {
    const who = t(pos === 1 ? 'seat.driver' : 'seat.passenger')
    const mode = t(kind === 'heat' ? 'seat.heating' : 'seat.cooling')
    try {
      const r = kind === 'heat' ? await api.setSeatHeat(pos, level) : await api.setSeatVent(pos, level)
      toastResult(r, `${who} · ${mode} · ${levelLabels()[level]}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.failed'), 'err')
    } finally {
      refresh()
    }
  }

  return (
    <div class="card">
      <div class="seats-grid">
        {COLS.map((c) => (
          <div class="seat-col" key={c.pos}>
            <div class="seat-col-title">{t(c.key)}</div>
            {canCool && (
              <div class="seat-mode">
                <div class="seat-mode-label cool"><IconSnow size={15} /> {t('seat.cooling')}</div>
                <Seg value={cool[c.idx] ?? 0} tone="cool" disabled={disabled} onSet={(l) => set('cool', c.pos, l)} />
              </div>
            )}
            <div class="seat-mode">
              <div class="seat-mode-label heat"><IconFlame size={15} /> {t('seat.heating')}</div>
              <Seg value={heat[c.idx] ?? 0} tone="heat" disabled={disabled} onSet={(l) => set('heat', c.pos, l)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
