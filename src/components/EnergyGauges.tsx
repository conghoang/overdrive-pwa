import { CircularGauge } from './CircularGauge'
import { distanceUnitLabel, fmtDistance } from '../lib/format'
import { t } from '../lib/i18n'
import { IconBattery, IconBolt, IconFuel } from './icons'
import type { StatusResponse } from '../lib/types'

/** A range only counts if the car gave a real positive number, as OD treats it. */
function positiveKm(v: number | undefined): number | null {
  return typeof v === 'number' && v > 0 ? v : null
}

/** Dual battery/fuel ring gauges + total range (reference-style Energy card). */
export function EnergyGauges({ s }: { s: StatusResponse }) {
  const unit = s.distanceUnit || 'km'
  const isPhev = !!s.range?.isPhev
  const range = s.range?.totalRangeKm ?? s.range?.elecRangeKm

  /*
   * How far each energy source is worth on its own, shown inside its own ring.
   *
   * Only on a PHEV: on a battery-only car the electric range IS the total, and
   * printing the same number inside the ring and again underneath it says
   * nothing twice. Each ring is decided separately, so a missing fuel reading
   * doesn't take the electric one down with it — and a missing or zero value
   * shows nothing rather than a confident "0 km", which is the difference
   * between "empty" and "the car didn't say".
   */
  const evKm = isPhev ? positiveKm(s.range?.elecRangeKm) : null
  const fuelKm = isPhev ? positiveKm(s.range?.fuelRangeKm) : null
  const asRange = (km: number | null) =>
    km == null ? undefined : { value: fmtDistance(km, unit), unit: distanceUnitLabel(unit) }

  return (
    <div class="card">
      <div class="card-title" style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <IconBolt size={15} /> {t('energy.title')}
      </div>
      <div class={'gauges' + (isPhev ? '' : ' single')}>
        <CircularGauge
          percent={s.soc?.percent}
          color="var(--success)"
          label={t('energy.battery')}
          icon={<IconBattery size={17} />}
          sub={asRange(evKm)}
        />
        {isPhev && (
          <CircularGauge
            percent={s.range?.fuelPercent}
            color="var(--m-orange)"
            label={t('energy.fuel')}
            icon={<IconFuel size={16} class="ico-fuel" />}
            sub={asRange(fuelKm)}
          />
        )}
      </div>
      <div class="gauges-range">
        <span class="mono">{fmtDistance(range, unit)}</span> {distanceUnitLabel(unit)} {t('energy.range')}
      </div>
    </div>
  )
}
