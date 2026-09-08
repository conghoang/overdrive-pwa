import { CircularGauge } from './CircularGauge'
import { distanceUnitLabel, fmtDistance } from '../lib/format'
import { IconBolt } from './icons'
import type { StatusResponse } from '../lib/types'

/** Dual battery/fuel ring gauges + total range (reference-style Energy card). */
export function EnergyGauges({ s }: { s: StatusResponse }) {
  const unit = s.distanceUnit || 'km'
  const isPhev = !!s.range?.isPhev
  const range = s.range?.totalRangeKm ?? s.range?.elecRangeKm

  return (
    <div class="card">
      <div class="card-title" style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <IconBolt size={15} /> Energy
      </div>
      <div class={'gauges' + (isPhev ? '' : ' single')}>
        <CircularGauge percent={s.soc?.percent} color="var(--success)" label="Battery" />
        {isPhev && <CircularGauge percent={s.range?.fuelPercent} color="var(--m-orange)" label="Fuel" />}
      </div>
      <div class="gauges-range">
        <span class="mono">{fmtDistance(range, unit)}</span> {distanceUnitLabel(unit)} range
      </div>
    </div>
  )
}
