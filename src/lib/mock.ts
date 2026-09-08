import type { StatusResponse, VehicleState } from './types'

// Demo/offline data so the UI can be previewed without pairing a real car.
// Activated by entering the device token `demo` on the setup screen.
export const DEMO_BASE = 'demo'
export const DEMO_TOKEN = 'demo'

export function isDemo(): boolean {
  return localStorage.getItem('odpwa.baseUrl') === DEMO_BASE
}

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
