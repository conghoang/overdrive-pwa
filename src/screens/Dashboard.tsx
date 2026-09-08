import { connected, lastError, status, vehicleState } from '../lib/store'
import { fmtDistance, distanceUnitLabel, fmtNum, fmtTemp, ago } from '../lib/format'
import { BatteryRing } from '../components/BatteryRing'
import { StatTile } from '../components/StatTile'
import { DoorStatus } from '../components/DoorStatus'
import {
  IconArrow,
  IconBolt,
  IconFuel,
  IconPin,
  IconPlug,
  IconThermo,
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
  const unit = s?.distanceUnit || 'km'
  const unitLabel = distanceUnitLabel(unit)

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

  const soc = s.soc?.percent
  const range = s.range?.totalRangeKm ?? s.range?.elecRangeKm
  const isPhev = !!s.range?.isPhev
  const fuelPct = s.range?.fuelPercent
  const charging = !!s.charging?.charging
  const plugged = !!s.charging?.plugged
  const chargePower = s.charging?.chargingPowerKW ?? s.charging?.powerKw
  const winOpen = windowsOpenCount(vs?.windows)
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

      {/* hero */}
      <div class="card hero">
        <BatteryRing percent={soc} charging={charging} subLabel={s.soc?.status} />
        <div class="hero-range">
          <span class="big mono">{fmtDistance(range, unit)}</span>
          <span class="unit">{unitLabel} range</span>
        </div>
        <div class="hero-badges">
          {charging ? (
            <span class="pill good">
              Charging{chargePower ? ` · ${fmtNum(chargePower, 1)} kW` : ''}
            </span>
          ) : s.charging?.plugged ? (
            <span class="pill">Plugged in</span>
          ) : (
            <span class="pill">{s.acc ? 'Awake' : 'Parked'}</span>
          )}
          {s.range?.isPhev && s.range?.fuelPercent != null && (
            <span class="pill">Fuel {Math.round(s.range.fuelPercent)}%</span>
          )}
          {s.inSafeZone && <span class="pill">{s.safeZoneName || 'Safe zone'}</span>}
        </div>
      </div>

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

      {/* energy: battery (+ fuel for PHEV) */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">Energy</div>
        <div class="energy-row">
          <div class="energy">
            <div class="energy-head">
              <span class="lab"><IconBolt size={16} /> Battery</span>
              <span class="val"><b>{soc == null ? '--' : Math.round(soc)}%</b> · {fmtDistance(s.range?.elecRangeKm, unit)} {unitLabel}</span>
            </div>
            <div class="energy-bar">
              <div class="energy-fill" style={{ width: `${soc || 0}%`, background: 'var(--accent-bright)' }} />
            </div>
          </div>
          {isPhev && (
            <div class="energy">
              <div class="energy-head">
                <span class="lab"><IconFuel size={16} /> Fuel</span>
                <span class="val"><b>{fuelPct == null ? '--' : Math.round(fuelPct)}%</b> · {fmtDistance(s.range?.fuelRangeKm, unit)} {unitLabel}</span>
              </div>
              <div class="energy-bar">
                <div class="energy-fill" style={{ width: `${fuelPct || 0}%`, background: 'var(--m-orange)' }} />
              </div>
            </div>
          )}
        </div>
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
        <StatTile
          icon={<IconThermo size={20} />}
          label="Cabin temp"
          value={fmtTemp(inside)}
          accent="var(--m-orange)"
        />
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

      {/* charging (only when relevant) */}
      {(charging || plugged) && (
        <div class="card" style={{ marginTop: '14px' }}>
          <div class="spread">
            <div class="card-title" style={{ margin: 0 }}>Charging</div>
            <span class={'pill ' + (charging ? 'good' : '')}>
              {charging ? 'Charging' : s.charging?.full ? 'Full' : 'Plugged in'}
            </span>
          </div>
          <div class="charge-grid">
            <div class="charge-stat">
              <div class="v mono">{fmtNum(chargePower, 1)}<small> kW</small></div>
              <div class="l">Power</div>
            </div>
            <div class="charge-stat">
              <div class="v">{s.charging?.stateName || '–'}</div>
              <div class="l">State</div>
            </div>
          </div>
        </div>
      )}

      {/* doors */}
      <div class="card" style={{ marginTop: '14px' }}>
        <DoorStatus doors={vs?.doors} />
      </div>

      {/* status */}
      <div class="card" style={{ marginTop: '14px' }}>
        <div class="card-title">Status</div>
        <div class="srow">
          <div class="srow-left">
            <IconWindow size={20} />
            <span class="srow-label">Windows</span>
          </div>
          {winOpen > 0 ? (
            <span class="pill warn">{winOpen} open</span>
          ) : (
            <span class="pill good">Closed</span>
          )}
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
