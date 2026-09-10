import type { StatusResponse, VehicleState } from './types'

// Demo/offline data so the UI can be previewed without pairing a real car.
// Activated by entering the device token `demo` on the setup screen.
export const DEMO_BASE = 'demo'
export const DEMO_TOKEN = 'demo'

let soc = 68

export function mockStatus(): StatusResponse {
  // gentle drift so charging looks alive between polls
  soc = Math.min(80, soc + 0.2)
  return {
    status: 'ok',
    deviceId: 'DEMO-SEAL-01',
    vehicleDataReady: true,
    appVersion: '1.0.0-demo',
    distanceUnit: 'km',
    pressureUnit: 'psi',
    locale: 'en',
    acc: false,
    battery: { voltage: 12.6, available: true },
    soc: { percent: soc, status: 'Good' },
    range: { elecRangeKm: Math.round(soc * 1.1), fuelRangeKm: 420, totalRangeKm: Math.round(soc * 1.1) + 420, isPhev: true, fuelPercent: 55 },
    charging: { charging: true, plugged: true, chargingPowerKW: 7.2, stateName: 'AC charging' },
    recordingStatus: { gear: 'P', accOn: false },
    soh: { percent: 97, estimatedCapacityKwh: 79.5, nominalCapacityKwh: 82.5 },
    gps: { lat: 10.7769, lng: 106.7009, hasLocation: true, isMoving: false, lastUpdate: Date.now() - 45000 },
    network: { type: 'wifi', ssid: 'Home', ip: '192.168.1.42' },
    inSafeZone: true,
    safeZoneName: 'Home',
  }
}

export function mockVehicleState(): VehicleState {
  return {
    success: true,
    doors: { overall: 1, rf: 1, lf: 1, rr: 1, lr: 1, trunk: 1, hood: 1 },
    windows: { lf: 0, rf: 0, lr: 0, rr: 0, sunroof: 0 },
    battery: { soc, rangeKm: soc * 5.2 },
    climate: { acOn: true, insideTempC: 24, windMode: 1, fanLevel: 2, remoteClimateActive: true },
    seats: { heat: [1, 0], cool: [0, 2], ventilatedSupported: true },
    tyres: {
      available: true,
      fl: { kPa: 250, psi: 36.3, temperatureC: 32, pressureState: 0, available: true },
      fr: { kPa: 248, psi: 36.0, temperatureC: 32, pressureState: 0, available: true },
      rl: { kPa: 245, psi: 35.5, temperatureC: 30, pressureState: 0, available: true },
      rr: { kPa: 228, psi: 33.1, temperatureC: 31, pressureState: 1, available: true },
    },
  }
}

/**
 * Charging history for demo mode.
 *
 * Anchored to *today* rather than fixed dates, so the seven-day window always
 * has something in it — and deliberately leaves two days empty, because the
 * real API omits days with no sessions and the chart has to prove it fills
 * those gaps itself.
 */
export function mockChargingOverview(days: number) {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const day = 86_400_000
  const pattern = [4.6, 0, 7.2, 3.7, 9.6, 5.4, 11.8] // last entry = today
  const daily = []
  for (let i = 0; i < Math.min(days, pattern.length); i++) {
    const kwh = pattern[pattern.length - 1 - i]
    if (kwh <= 0) continue // as the car does: no session, no row
    daily.push({
      day: midnight.getTime() - i * day,
      sessions: 1,
      energy: kwh,
      cost: Math.round(kwh * 4000),
      incomplete: 0,
      estimated: 1,
    })
  }
  const energy = daily.reduce((a, d) => a + d.energy, 0)
  return {
    success: true,
    summary: {
      daily: daily.reverse(),
      periodSessions: daily.length,
      periodEnergyKwh: energy,
      periodCost: Math.round(energy * 4000),
      periodIncompleteSessions: 0,
      periodEstimatedSessions: daily.length,
      avgCostPerKwh: 4000,
    },
    sessions: [
      {
        id: 1,
        startTime: Date.now() - 3.7 * 3600_000,
        endTime: Date.now(),
        inProgress: false,
        startSoc: 20,
        endSoc: 82,
        energyAdded: 11.6,
        durationMinutes: 222,
        cost: 46400,
        currency: '\u20ab',
        isDc: false,
        energySource: 'soc_estimate',
      },
    ],
  }
}

/** Trip recording on, with a few days' driving — anchored to today. */
export function mockTripConfig() {
  return { success: true, config: { enabled: true, currency: '\u20ab', distanceUnit: 'km', isPhev: true } }
}

export function mockTrips(days: number) {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const day = 86_400_000
  // [daysAgo, km] — two quiet days on purpose, so the zero-fill is exercised.
  const plan: [number, number][] = [
    [0, 12.4], [0, 5.1], [1, 18.9], [3, 7.6], [3, 22.3], [4, 9.2], [6, 15.5],
  ]
  return plan
    .filter(([ago]) => ago < days)
    .map(([ago, km], i) => {
      const start = midnight.getTime() - ago * day + (8 + i) * 3600_000
      const durationSeconds = Math.round((km / 24) * 3600)
      return {
        id: 100 + i,
        startTime: start,
        endTime: start + durationSeconds * 1000,
        distanceKm: km,
        durationSeconds,
        avgSpeedKmh: 24,
        energyUsedKwh: km * 0.16,
        energyMetered: true,
        tripCost: Math.round(km * 0.16 * 4000),
        currency: '\u20ab',
      }
    })
}
