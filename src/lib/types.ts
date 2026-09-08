// Response shapes for the OverDrive head-unit HTTP API.
// Fields are optional/permissive on purpose — the backend aggregates many
// signals and any of them can be absent depending on the vehicle/state.

export interface Battery12V { voltage?: number; available?: boolean; isStale?: boolean }
export interface SocInfo { percent?: number; isLow?: boolean; isCritical?: boolean; status?: string }
export interface RangeInfo {
  elecRangeKm?: number
  fuelRangeKm?: number
  totalRangeKm?: number
  isLow?: boolean
  isCritical?: boolean
  status?: string
  fuelPercent?: number
  isPhev?: boolean
}
export interface ChargingInfo {
  stateName?: string
  status?: string
  chargingPowerKW?: number
  powerKw?: number
  charging?: boolean
  plugged?: boolean
  full?: boolean
  fault?: boolean
  isDischarging?: boolean
  powerSource?: string
}
export interface SohInfo { percent?: number; estimatedCapacityKwh?: number; nominalCapacityKwh?: number }
export interface GpsInfo {
  lat?: number
  lng?: number
  speed?: number
  heading?: number
  accuracy?: number
  altitude?: number
  lastUpdate?: number
  isMoving?: boolean
  hasLocation?: boolean
  isStale?: boolean
  ageMs?: number
  canSpeedKmh?: number
}
export interface NetworkInfo { type?: string; ssid?: string; ip?: string }
export interface TripStatus { enabled?: boolean; tripActive?: boolean; tripStartTime?: number; tripDurationSec?: number }

export interface StatusResponse {
  status?: string
  deviceId?: string
  vehicleDataReady?: boolean
  appVersion?: string
  distanceUnit?: string
  pressureUnit?: string
  locale?: string
  acc?: boolean
  battery?: Battery12V
  soc?: SocInfo
  range?: RangeInfo
  charging?: ChargingInfo
  soh?: SohInfo
  gps?: GpsInfo
  network?: NetworkInfo
  gpuSurveillance?: boolean
  inSafeZone?: boolean
  safeZoneSuppressed?: boolean
  safeZoneName?: string
  tripStatus?: TripStatus
  recordingStatus?: { gear?: string; accOn?: boolean }
}

// --- /api/vehicle/state ---
// doors: 1 = locked/closed, 2 = unlocked/open, -1 = unknown
export interface DoorsState {
  rf?: number; lf?: number; rr?: number; lr?: number
  trunk?: number; hood?: number; overall?: number
  source?: string; scope?: string
}
// windows: open percent (0 = closed, 100 = open, -1 = unknown)
export interface WindowsState { lf?: number; rf?: number; lr?: number; rr?: number; sunroof?: number; sunshade?: number }
export interface LightsState {
  lowBeam?: number; highBeam?: number; hazard?: number
  dayTimeLight?: number; ambientColour?: number
  ambientEnabled?: boolean; ambientOptions?: unknown[]
}
export interface SeatsState { heat?: number[]; cool?: number[]; ventilatedSupported?: boolean; steeringHeat?: boolean }
export interface ClimateState {
  acOn?: boolean
  insideTempC?: number
  windMode?: number
  fanLevel?: number
  remoteClimateActive?: boolean
}
export interface TyreCorner {
  kPa?: number
  psi?: number
  temperatureC?: number
  pressureState?: number
  airLeakState?: number
  signalState?: number
  available?: boolean
}
export interface TyresState {
  available?: boolean
  fl?: TyreCorner
  fr?: TyreCorner
  rl?: TyreCorner
  rr?: TyreCorner
}

export interface VehicleState {
  success?: boolean
  doors?: DoorsState
  windows?: WindowsState
  trunk?: { lockStatus?: number }
  sunroof?: { state?: number; position?: number }
  battery?: { soc?: number; rangeKm?: number; bodyworkRangeKm?: number }
  lights?: LightsState
  adas?: { speedLimitWarning?: number }
  setting?: { childPresenceDetection?: boolean }
  seats?: SeatsState
  batteryHeat?: boolean
  climate?: ClimateState
  tyres?: TyresState
}

export interface CloudStatus {
  success?: boolean
  configured?: boolean
  verified?: boolean
  enabled?: boolean
}

export interface ControlResult {
  success?: boolean
  message?: string
  error?: string
  outcome?: string
  latencyMs?: number
  path?: string
}

export interface LoginResponse {
  success?: boolean
  jwt?: string
  deviceId?: string
  expiresIn?: number
  error?: string
}
