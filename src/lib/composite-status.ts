import type { GpsInfo, LauncherSummary, StatusResponse } from './types'

/*
 * A StatusResponse assembled from /api/launcher/v1/summary + /api/gps.
 *
 * OverDrive v61.1 answers GET /status without Access-Control-Allow-Origin, so a
 * browser can never read it; those two endpoints still carry CORS. Every field
 * here is a faithful copy of something the car reported. What neither endpoint
 * reports (network, units, locale, appVersion, recording state, safe zone,
 * 12 V battery, nominal capacity, plugged/full while idle) stays undefined, so
 * the UI hides it or falls back to its own default.
 */

/** The /api/gps reply: the fix lives under `location`. */
export interface GpsReply {
  location?: {
    lat?: number; lng?: number; latitude?: number; longitude?: number
    speed?: number; heading?: number; accuracy?: number; altitude?: number
    lastUpdate?: number; isMoving?: boolean; hasLocation?: boolean
    isStale?: boolean; ageMs?: number; canSpeedKmh?: number; accOn?: boolean
  }
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined)

export function statusFromSummary(sum: LauncherSummary, gps?: GpsReply | null): StatusResponse {
  const out: StatusResponse = {}
  const loc = gps?.location

  const accState = sum.state?.acc
  out.acc = accState === 'on' ? true : accState === 'off' ? false : typeof loc?.accOn === 'boolean' ? loc.accOn : undefined

  const soc = num(sum.battery?.socPct) ?? num(sum.range?.socPct)
  if (soc !== undefined) out.soc = { percent: soc }

  const r = sum.range
  if (r || sum.vehicle) {
    out.range = {
      elecRangeKm: num(r?.elecKm),
      fuelRangeKm: num(r?.fuelKm),
      totalRangeKm: num(r?.totalKm),
      fuelPercent: num(r?.fuelPct),
      isPhev: sum.vehicle?.isPhev,
    }
  }

  const c = sum.charging
  if (c) {
    const active = typeof c.active === 'boolean' ? c.active : undefined
    const kw = num(c.kw)
    out.charging = {
      charging: active,
      // Plugged is only known to be true while energy is flowing.
      plugged: active ? true : undefined,
      chargingPowerKW: kw,
      powerKw: kw,
      isEstimated: c.kwEstimated,
      sessionKwh: num(c.addedKwh) ?? null,
    }
  }

  const b = sum.battery
  if (b && (num(b.healthPct) !== undefined || num(b.usableKwh) !== undefined)) {
    out.soh = { percent: num(b.healthPct), estimatedCapacityKwh: num(b.usableKwh) }
  }

  const lat = num(loc?.lat) ?? num(loc?.latitude)
  const lng = num(loc?.lng) ?? num(loc?.longitude)
  if (loc && lat !== undefined && lng !== undefined) {
    const g: GpsInfo = {
      lat, lng,
      speed: loc.speed, heading: loc.heading, accuracy: loc.accuracy, altitude: loc.altitude,
      lastUpdate: loc.lastUpdate, isMoving: loc.isMoving, hasLocation: loc.hasLocation,
      isStale: loc.isStale, ageMs: loc.ageMs, canSpeedKmh: loc.canSpeedKmh,
    }
    out.gps = g
  }
  return out
}
