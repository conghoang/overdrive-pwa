import { useState } from 'preact/hooks'
import { carPhoto } from '../lib/settings'
import { distanceUnitLabel, fmtDistance, fmtNum } from '../lib/format'
import { IconBolt, IconCar } from './icons'
import { CarImage } from './CarImage'
import type { StatusResponse } from '../lib/types'

const GEARS = ['P', 'R', 'N', 'D']
const DEFAULT_PHOTO = `${import.meta.env.BASE_URL}car/sealion6.png`

/** Reference-style vehicle hero: model, range, car photo, P R N D, charging. */
export function CarHero({ s }: { s: StatusResponse }) {
  const [imgOk, setImgOk] = useState(true)
  const unit = s.distanceUnit || 'km'
  const range = s.range?.totalRangeKm ?? s.range?.elecRangeKm
  const gear = s.recordingStatus?.gear
  const charging = !!s.charging?.charging
  const power = s.charging?.chargingPowerKW ?? s.charging?.powerKw
  const photo = carPhoto.value || DEFAULT_PHOTO

  return (
    <div class="card car-hero-card">
      <div class="veh-head">
        <span class="veh-title"><IconCar size={20} /> Sealion 6 DMi</span>
      </div>

      <div class="veh-range">
        <span class="veh-range-num mono">{fmtDistance(range, unit)}</span>
        <span class="veh-range-unit">{distanceUnitLabel(unit)}</span>
      </div>
      <div class="veh-range-label">Range</div>

      {imgOk ? (
        <img class="car-photo" src={photo} alt="Sealion 6 DMi" onError={() => setImgOk(false)} />
      ) : (
        <div class="car-photo"><CarImage color="#c7ccd1" /></div>
      )}

      <div class="prnd">
        {GEARS.map((g) => (
          <span key={g} class={'prnd-item' + (gear === g ? ' on' : '')}>{g}</span>
        ))}
      </div>

      {charging ? (
        <div class="charging-line on">
          <IconBolt size={16} /> Charging{power ? ` · ${fmtNum(power, 1)} kW` : ''}
        </div>
      ) : (
        <div class="charging-line">{s.acc ? 'Ready' : s.charging?.plugged ? 'Plugged in' : 'Parked'}</div>
      )}
    </div>
  )
}
