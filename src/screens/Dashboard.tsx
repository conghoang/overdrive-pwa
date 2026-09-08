import { connected, lastError, status, vehicleState } from '../lib/store'
import { fmtDistance, distanceUnitLabel, fmtNum, fmtTemp, ago } from '../lib/format'
import { BatteryRing } from '../components/BatteryRing'
import { StatTile } from '../components/StatTile'
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
  const charging = !!s.charging?.charging
  const chargePower = s.charging?.chargingPowerKW ?? s.charging?.powerKw
  const doorsLocked = vs?.doors?.overall
  const winOpen = windowsOpenCount(vs?.windows)
  const climateOn = !!(vs?.climate?.acOn || vs?.climate?.remoteClimateActive)
  const inside = vs?.climate?.insideTempC
  const v12 = s.battery?.voltage

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
