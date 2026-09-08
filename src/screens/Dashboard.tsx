import { connected, lastError, status, vehicleState } from '../lib/store'
import { fmtNum, fmtTemp, ago } from '../lib/format'
import { CarHero } from '../components/CarHero'
import { EnergyGauges } from '../components/EnergyGauges'
import { StatTile } from '../components/StatTile'
import { Tyres } from '../components/Tyres'
import {
  IconArrow,
  IconLock,
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
      <div>
        <Header connected={connected.value} />
        <div class="card">
          <div class="center-note">
            {connected.value ? 'Loading vehicle…' : lastError.value || 'Connecting to your car…'}
          </div>
        </div>
      </div>
    )
  }

  const unit = s.distanceUnit || 'km'
  const winOpen = windowsOpenCount(vs?.windows)
  const doorsLocked = vs?.doors?.overall
  const climateOn = !!(vs?.climate?.acOn || vs?.climate?.remoteClimateActive)
  const inside = vs?.climate?.insideTempC
  const v12 = s.battery?.voltage

  const powerOn = !!s.acc
  const gear = s.recordingStatus?.gear
  const rawKmh =
    s.gps?.canSpeedKmh != null ? s.gps.canSpeedKmh : s.gps?.speed != null ? s.gps.speed * 3.6 : null
  const speedUnit = unit === 'mi' ? 'mph' : 'km/h'
  const speedDisp =
    !s.gps?.isMoving || rawKmh == null
      ? 0
      : Math.max(0, Math.round(unit === 'mi' ? rawKmh * 0.621371 : rawKmh))

  return (
    <div>
      <Header connected={connected.value} />

      <CarHero s={s} />

      {/* power / gear / speed */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="vitals">
          <div class="vital">
            <div class={'vital-value ' + (powerOn ? 'vital-on' : 'vital-off')}>{powerOn ? 'On' : 'Off'}</div>
            <div class="vital-label">Power</div>
          </div>
          <div class="vital">
            <div class="vital-value">{gear || '–'}</div>
            <div class="vital-label">Gear</div>
          </div>
          <div class="vital">
            <div class="vital-value mono">{speedDisp}<small> {speedUnit}</small></div>
            <div class="vital-label">Speed</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <EnergyGauges s={s} />
      </div>

      {/* metric tiles */}
      <div class="tiles" style={{ marginTop: '14px' }}>
        <StatTile
          icon={<IconPlug size={20} />}
          label="Battery health"
          value={s.soh?.percent != null ? String(Math.round(s.soh.percent)) : '--'}
          unit="%"
          accent="var(--m-teal)"
        />
        <StatTile icon={<IconThermo size={20} />} label="Cabin temp" value={fmtTemp(inside)} accent="var(--m-orange)" />
        <StatTile
          icon={<IconWifi size={20} />}
          label={s.network?.type === 'wifi' ? s.network?.ssid || 'Wi-Fi' : 'Network'}
          value={s.network?.type === 'cellular' ? 'Cellular' : s.network?.type === 'wifi' ? 'Wi-Fi' : '--'}
          accent="var(--m-blue)"
        />
        <StatTile
          icon={<IconPlug size={20} />}
          label="12V battery"
          value={v12 != null ? fmtNum(v12, 1) : '--'}
          unit="V"
          accent="var(--m-purple)"
        />
      </div>

      {/* tyre pressure */}
      <div style={{ marginTop: '14px' }}>
        <Tyres tyres={vs?.tyres} unit={s.pressureUnit || 'kpa'} />
      </div>

      {/* status */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">Status</div>
        <div class="srow">
          <div class="srow-left">
            {doorsLocked === 1 ? <IconLock size={20} /> : <IconUnlock size={20} />}
            <span class="srow-label">Doors</span>
          </div>
          {doorsLocked === 1 ? (
            <span class="pill good">Locked</span>
          ) : doorsLocked === 2 ? (
            <span class="pill warn">Unlocked</span>
          ) : (
            <span class="pill">Unknown</span>
          )}
        </div>
        <div class="srow">
          <div class="srow-left">
            <IconWindow size={20} />
            <span class="srow-label">Windows</span>
          </div>
          {winOpen > 0 ? <span class="pill warn">{winOpen} open</span> : <span class="pill good">Closed</span>}
        </div>
        <div class="srow">
          <div class="srow-left">
            <IconWind size={20} />
            <span class="srow-label">Climate</span>
          </div>
          <span class={'pill' + (climateOn ? ' good' : '')}>{climateOn ? 'On' : 'Off'}</span>
        </div>
      </div>

      {/* location */}
      {s.gps?.hasLocation && s.gps?.lat != null && s.gps?.lng != null && (
        <div class="card" style={{ marginTop: '14px' }}>
          <div class="card-title">Location</div>
          <div class="row" style={{ gap: '11px' }}>
            <IconPin size={20} />
            <div class="stack">
              <span class="loc-coords mono">
                {s.gps.lat.toFixed(5)}, {s.gps.lng.toFixed(5)}
              </span>
              <span class="screen-sub">
                {s.gps.isMoving ? 'Moving' : 'Parked'}
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
            Open in Maps <IconArrow size={16} />
          </a>
        </div>
      )}
    </div>
  )
}

function Header({ connected: isConnected }: { connected: boolean }) {
  return (
    <div class="screen-head">
      <div>
        <h1 class="screen-title">Vehicle</h1>
        <div class="screen-sub">{isConnected ? 'Live' : 'Reconnecting…'}</div>
      </div>
      <span class={'dot ' + (isConnected ? 'ok' : 'wait')} />
    </div>
  )
}
