import { connected, lastError, outsideTempC, pm25Inside, pm25Outside, status, vehicleState } from '../lib/store'
import { fmtTemp, ago } from '../lib/format'
import { t } from '../lib/i18n'
import { carName, showMap } from '../lib/settings'
import { MiniMap } from '../components/MiniMap'
import { AppHeader } from '../components/AppHeader'
import { CarHero } from '../components/CarHero'
import { ChargingCard, chargingPhase } from '../components/ChargingCard'
import { QuickActions } from '../components/QuickActions'
import { EnergyGauges } from '../components/EnergyGauges'
import { StatTile } from '../components/StatTile'
import { Tyres } from '../components/Tyres'
import {
  IconAir,
  IconLock,
  IconMapOpen,
  IconPin,
  IconPlug,
  IconThermo,
  IconUnlock,
  IconWifi,
  IconWind,
  IconWindow,
} from '../components/icons'
import type { WindowsState } from '../lib/types'
import './dashboard.css'

function windowsOpenCount(w: WindowsState | undefined): number {
  if (!w) return 0
  const vals = [w.lf, w.rf, w.lr, w.rr, w.sunroof, w.sunshade]
  return vals.filter((v) => typeof v === 'number' && v > 0).length
}

export function Dashboard() {
  const s = status.value
  const vs = vehicleState.value

  if (!s) {
    return (
      <div class="screen">
        <AppHeader title={carName.value || t('tab.vehicle')} sub={connected.value ? t('common.live') : t('common.reconnecting')} dot={connected.value ? 'ok' : 'wait'} />
        <div class="card">
          <div class="center-note">
            {connected.value ? t('common.loading_vehicle') : lastError.value || t('common.connecting_car')}
          </div>
        </div>
      </div>
    )
  }

  const unit = s.distanceUnit || 'km'
  const winOpen = windowsOpenCount(vs?.windows)
  const doorsLocked = vs?.doors?.overall
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

  const powerOn = !!s.acc
  /*
   * With the ignition off the car is in Park — a BYD shifts there on shutdown.
   * /status does not enforce that: it returns RecordingModeManager.currentGear,
   * which only updates when the gear monitor reports a change and is never
   * reset on ACC off, so it can hold a stale driving gear. OD's own MQTT path
   * forces P in this case; /status just omits the check.
   *
   * Tested against `=== false`, not falsy: a build that never sends `acc` leaves
   * it undefined, and inventing a gear from missing data would be worse than
   * showing what the car said.
   */
  const gear = s.acc === false ? 'P' : s.recordingStatus?.gear
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
  const canMove = powerOn && gear !== 'P'
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

      {/* power / gear / speed */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="vitals">
          <div class="vital">
            <div class={'vital-value ' + (powerOn ? 'vital-on' : 'vital-off')}>{powerOn ? t('common.on') : t('common.off')}</div>
            <div class="vital-label">{t('vitals.power')}</div>
          </div>
          <div class="vital">
            <div class="vital-value">{gear || '–'}</div>
            <div class="vital-label">{t('vitals.gear')}</div>
          </div>
          <div class="vital">
            <div class="vital-value mono">{speedDisp}<small> {speedUnit}</small></div>
            <div class="vital-label">{t('vitals.speed')}</div>
          </div>
        </div>
      </div>

      {/* status */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">{t('status.title')}</div>
        <div class="srow">
          <div class="srow-left">
            {doorsLocked === 1 ? <IconLock size={20} /> : <IconUnlock size={20} />}
            <span class="srow-label">{t('status.doors')}</span>
          </div>
          {doorsLocked === 1 ? (
            <span class="pill good">{t('status.locked')}</span>
          ) : doorsLocked === 2 ? (
            <span class="pill warn">{t('status.unlocked')}</span>
          ) : (
            <span class="pill">{t('common.unknown')}</span>
          )}
        </div>
        <div class="srow">
          <div class="srow-left">
            <IconWindow size={20} />
            <span class="srow-label">{t('status.windows')}</span>
          </div>
          {winOpen > 0 ? (
            <span class="pill warn">{t('status.open_count', { n: winOpen })}</span>
          ) : (
            <span class="pill good">{t('status.closed')}</span>
          )}
        </div>
        <div class="srow">
          <div class="srow-left">
            <IconWind size={20} />
            <span class="srow-label">{t('status.climate')}</span>
          </div>
          <span class={'pill' + (climateOn ? ' good' : '')}>{climateOn ? t('common.on') : t('common.off')}</span>
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <EnergyGauges s={s} />
      </div>

      {/* tyre pressure */}
      <div style={{ marginTop: '14px' }}>
        <Tyres tyres={vs?.tyres} unit={s.pressureUnit || 'kpa'} />
      </div>

      {/* location */}
      {s.gps?.hasLocation && s.gps?.lat != null && s.gps?.lng != null && (
        <div class="card" style={{ marginTop: '14px' }}>
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
            <MiniMap lat={s.gps.lat} lng={s.gps.lng} />
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

      {/* Minor info tiles. No 12V voltage: /status reports it as
          {available:false, isStale:true} most of the time, so it was usually a
          stale number or a dash — and it is not something you act on anyway. */}
      <div class="tiles" style={{ marginTop: '14px' }}>
        <StatTile
          icon={<IconPlug size={20} />}
          label={t('tile.battery_health')}
          value={s.soh?.percent != null ? String(Math.round(s.soh.percent)) : '--'}
          unit="%"
          accent="var(--m-teal)"
        />
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

