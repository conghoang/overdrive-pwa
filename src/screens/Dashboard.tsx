import { connected, lastError, odometer, outsideTempC, pm25Inside, pm25Outside, status, vehicleState } from '../lib/store'
import { fmtTemp, ago, fmtOdo, distanceUnitLabel } from '../lib/format'
import { t } from '../lib/i18n'
import { effectiveGear } from '../lib/vehicle'
import { carName, showMap } from '../lib/settings'
import { AppHeader } from '../components/AppHeader'
import { CarHero } from '../components/CarHero'
import { chargingPhase } from '../lib/charging'
import { lazyScreen } from '../lib/lazy'
import { MiniMapLazy } from '../components/MiniMapLazy'

/*
 * The charging card and its artwork only ever render while the car is plugged
 * in, so they load then rather than riding in the app shell. It renders nothing
 * until the chunk lands — for a card that is conditional anyway, a beat of
 * empty space reads as "not charging yet", not as a loading state.
 */
const ChargingCard = lazyScreen(() => import('../components/ChargingCard'), 'ChargingCard', null)
import { QuickActions } from '../components/QuickActions'
import { StatTile } from '../components/StatTile'
import { Tyres } from '../components/Tyres'
import { IconAir, IconBolt, IconGauge, IconMapOpen, IconPin, IconRoad, IconShift, IconThermo, IconWifi, IconWind } from '../components/icons'
import './dashboard.css'

export function Dashboard() {
  const s = status.value
  const vs = vehicleState.value

  if (!s) {
    // Skeleton shaped like the dashboard, so the first load reads as "coming up"
    // rather than an empty error card. The header still carries the real status.
    return (
      <div class="screen">
        <AppHeader
          title={carName.value || t('tab.vehicle')}
          sub={connected.value ? t('common.loading_vehicle') : lastError.value || t('common.connecting_car')}
          dot="wait"
        />
        <div class="sk sk-card" style={{ height: '150px' }} />
        <div class="sk sk-card" style={{ height: '58px' }} />
        <div class="sk sk-card" style={{ height: '96px' }} />
        <div class="sk sk-card" style={{ height: '150px' }} />
        <div class="tiles" style={{ marginTop: '14px' }}>
          {[0, 1, 2, 3].map((i) => <div key={i} class="sk" style={{ height: '92px', borderRadius: 'var(--radius-md)' }} />)}
        </div>
      </div>
    )
  }

  const unit = s.distanceUnit || 'km'
  /*
   * Driving efficiency — electric (kWh) and fuel (L) averaged over the last
   * ~100 km of driving, accumulated across recent trips in getOdometer. A
   * rolling window reads truer than a single last-trip figure that a 2 km hop
   * can skew. Shows "--" until the trip log lands.
   */
  const odo = odometer.value
  const kwh100 = odo?.recentKwhPer100
  const efficiency = kwh100 == null ? '--' : kwh100.toFixed(1)
  const fuelL = odo?.recentLPer100
  const fuelCons = fuelL == null ? '--' : fuelL.toFixed(1)
  const climateOn = !!(vs?.climate?.acOn || vs?.climate?.remoteClimateActive)
  /*
   * Cabin temperature is only sent while the sensor is actually answering — on a
   * parked car OverDrive omits it rather than serving a stale reading, so the
   * tile used to sit at "--" indefinitely. Fall back to outside air, relabelled,
   * so the tile always says something true about what it is showing.
   */
  const inside = vs?.climate?.insideTempC
  const hasCabin = typeof inside === 'number'
  const tempValue = hasCabin ? inside : outsideTempC.value
  const tempLabel = hasCabin ? t('tile.cabin_temp') : t('tile.outside_temp')
  // Inside is the number that matters, but it only means something next to the
  // outside reading — 5 is unremarkable until you see it against 30.
  const pm = (v: number | null) => (v != null ? String(Math.round(v)) : '--')
  const pm25Pair =
    pm25Inside.value == null && pm25Outside.value == null
      ? '--'
      : `${pm(pm25Inside.value)} / ${pm(pm25Outside.value)}`

  // Only an ACTIVE charge earns the top slot. Merely plugged in, full or
  // faulted, the card keeps its usual place below the hero.
  const chargingNow = chargingPhase(s) === 'charging'

  const gear = effectiveGear(s)
  const rawKmh =
    s.gps?.canSpeedKmh != null ? s.gps.canSpeedKmh : s.gps?.speed != null ? s.gps.speed * 3.6 : null
  const speedUnit = unit === 'mi' ? 'mph' : 'km/h'
  /*
   * A car in Park with the ignition off cannot be moving, whatever the GPS
   * thinks. OverDrive's gps.isMoving is literally `speed > 1.0f` on the raw GPS
   * fix — no smoothing, no ignition or gear check — so a stationary car with a
   * mediocre fix (15 m accuracy here) drifts past it and reports a speed. That
   * is how a parked car showed 11 km/h while OD's own UI said parked: OD reads
   * gear and ACC for that, not the GPS.
   *
   * So the gear and ignition gate the readout, and isMoving only refines it —
   * which also keeps it at 0 when stopped in gear at a light.
   */
  const canMove = !!s.acc && gear !== 'P'
  const speedDisp =
    !canMove || !s.gps?.isMoving || rawKmh == null
      ? 0
      : Math.max(0, Math.round(unit === 'mi' ? rawKmh * 0.621371 : rawKmh))

  return (
    <div class="screen">
      <AppHeader title={carName.value || t('tab.vehicle')} sub={connected.value ? t('common.live') : t('common.reconnecting')} dot={connected.value ? 'ok' : 'wait'} />

      {/* While current is actually flowing this leads the page — it is what you
          opened the app to check. In every other plugged-in state it sits in
          its usual place below the hero. Renders null when unplugged, and
          carries its margin on whichever side it needs, so no empty spacer is
          left behind either way. */}
      {chargingNow && <ChargingCard s={s} atTop />}

      <CarHero s={s} />
      <QuickActions />

      {!chargingNow && <ChargingCard s={s} />}

      {/* Tyre pressure + location, paired: side by side once the screen is wide
          enough (foldables unfolded, tablets), stacked on a normal phone. The
          grid itself is the breakpoint — no media query — so a single card
          (no GPS fix) still fills the row instead of leaving a gap. */}
      <div class="dash-pair">
        {/* tyre pressure */}
        <Tyres tyres={vs?.tyres} unit={s.pressureUnit || 'kpa'} />

        {/* location */}
        {s.gps?.hasLocation && s.gps?.lat != null && s.gps?.lng != null && (
          <div class="card loc-card">
            <div class="spread" style={{ marginBottom: showMap.value ? '10px' : 0 }}>
              <div class="card-title" style={{ margin: 0 }}>{t('loc.title')}</div>
              {/* In map mode the map says where it is, so the row below is dropped
                  and Open-in-Maps becomes a compact icon button. */}
              {showMap.value && (
                <a
                  class="loc-ext"
                  href={`https://www.google.com/maps/search/?api=1&query=${s.gps.lat},${s.gps.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('loc.open_maps')}
                  aria-label={t('loc.open_maps')}
                >
                  <IconMapOpen size={19} />
                </a>
              )}
            </div>

            {showMap.value ? (
              <MiniMapLazy lat={s.gps.lat} lng={s.gps.lng} />
            ) : (
              <>
                <div class="row" style={{ gap: '11px' }}>
                  <IconPin size={20} />
                  <div class="stack">
                    <span class="loc-coords mono">
                      {s.gps.lat.toFixed(5)}, {s.gps.lng.toFixed(5)}
                    </span>
                    <span class="screen-sub">
                      {s.gps.isMoving ? t('loc.moving') : t('loc.parked')}
                      {s.gps.lastUpdate ? ` · ${ago(s.gps.lastUpdate)}` : ''}
                    </span>
                  </div>
                </div>
                <a
                  class="loc-link"
                  href={`https://www.google.com/maps/search/?api=1&query=${s.gps.lat},${s.gps.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconMapOpen size={17} /> {t('loc.open_maps')}
                </a>
              </>
            )}
          </div>
        )}
      </div>

      {/* odometer / gear / speed / climate — the vehicle-stats card, placed
          below the location map. Odometer leads: it moved here out of the hero,
          which now leads with range. Its row is drawn only when the car reports
          a reading. */}
      <div class="card" style={{ marginTop: '14px' }}>
        {odo?.totalKm != null && (
          <div class="srow">
            <div class="srow-left">
              <IconRoad size={20} />
              <span class="srow-label">{t('car.odo')}</span>
            </div>
            <div class="odo-right">
              <span class="srow-val mono">{fmtOdo(odo.totalKm, unit)} <small>{distanceUnitLabel(unit)}</small></span>
              {(odo.evKm != null || odo.hevKm != null) && (
                <span class="odo-sub mono">
                  {t('car.odo_ev')} {fmtOdo(odo.evKm, unit)} · {t('car.odo_hev')} {fmtOdo(odo.hevKm, unit)}
                </span>
              )}
            </div>
          </div>
        )}
        <div class="srow">
          <div class="srow-left">
            <IconShift size={20} />
            <span class="srow-label">{t('vitals.gear')}</span>
          </div>
          <span class="srow-val">{gear || '–'}</span>
        </div>
        <div class="srow">
          <div class="srow-left">
            <IconGauge size={20} />
            <span class="srow-label">{t('vitals.speed')}</span>
          </div>
          <span class="srow-val mono">{speedDisp} <small>{speedUnit}</small></span>
        </div>
        <div class="srow">
          <div class="srow-left">
            <IconWind size={20} />
            <span class="srow-label">{t('status.climate')}</span>
          </div>
          <span class={'srow-val' + (climateOn ? ' on' : '')}>{climateOn ? t('common.on') : t('common.off')}</span>
        </div>
      </div>

      {/* Minor info tiles. No 12V voltage: /status reports it as
          {available:false, isStale:true} most of the time, so it was usually a
          stale number or a dash — and it is not something you act on anyway. */}
      <div class="tiles" style={{ marginTop: '14px' }}>
        {/* Consumption: electric (kWh/100km) and fuel (L/100km) in one tile. */}
        <div class="tile">
          <div class="tile-icon" style={{ color: 'var(--m-teal)' }}><IconBolt size={20} /></div>
          <div class="tile-dual mono">
            <span><b>{efficiency}</b> <small>kWh</small></span>
            {/* Fuel only when it actually burned some — a pure-EV drive reads
                0.0 L, which is just noise next to the kWh. */}
            {fuelL != null && fuelL > 0 && (
              <>
                <span class="dual-sep">·</span>
                <span><b>{fuelCons}</b> <small>L</small></span>
              </>
            )}
          </div>
          <div class="tile-label">{t('tile.efficiency')}</div>
        </div>
        <StatTile icon={<IconThermo size={20} />} label={tempLabel} value={fmtTemp(tempValue)} accent="var(--m-orange)" />
        <StatTile
          icon={<IconAir size={20} />}
          label={t('tile.pm25')}
          value={pm25Pair}
          unit="µg/m³"
          accent="var(--success)"
        />
        <StatTile
          icon={<IconWifi size={20} />}
          label={s.network?.type === 'wifi' ? s.network?.ssid || t('tile.wifi') : t('tile.network')}
          value={s.network?.type === 'cellular' ? t('tile.cellular') : s.network?.type === 'wifi' ? t('tile.wifi') : '--'}
          accent="var(--m-blue)"
        />
      </div>
    </div>
  )
}

