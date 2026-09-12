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
  /** MEASURED cabin air. Only sent while the sensor is actually answering. */
  insideTempC?: number
  windMode?: number
  fanLevel?: number
  /** The DIAL, not the measurement. Power-gated: absent while the car is off. */
  setpointDriver?: number
  setpointPassenger?: number
  /** Unit the setpoint is expressed in: 1 = Celsius, 0 = Fahrenheit. */
  tempUnit?: number
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
/** User-configured kPa limits, sent alongside the readings by /api/vehicle/state. */
export interface TyreLimits {
  frontLow?: number
  frontHigh?: number
  rearLow?: number
  rearHigh?: number
  criticalLow?: number
}
export interface TyresState {
  available?: boolean
  fl?: TyreCorner
  fr?: TyreCorner
  rl?: TyreCorner
  rr?: TyreCorner
  limits?: TyreLimits
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

export interface LauncherSummary {
  /** Ambient, NOT cabin: weather cache, falling back to the car's external sensor. */
  env?: { tempC?: number | null }
  /** Cabin vs ambient particulates, µg/m³. */
  air?: { pm25Inside?: number | null; pm25Outside?: number | null }
  charging?: {
    active?: boolean
    kw?: number
    kwEstimated?: boolean
    etaMin?: number | null
    targetPct?: number | null
  }
  /** Usable pack capacity, used to estimate time-to-full before the car reports one. */
  battery?: { usableKwh?: number | null; socPct?: number | null }
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
  /** Stream enable only: not a failure, means "the pipeline is still coming up — ask again". */
  starting?: boolean
}

export interface LoginResponse {
  success?: boolean
  jwt?: string
  deviceId?: string
  expiresIn?: number
  error?: string
}

// --- /api/charging/overview ---
/** One calendar day's roll-up. Days with no charging are OMITTED, not zero-filled. */
export interface ChargingDay {
  /** Local midnight, epoch ms. */
  day: number
  sessions?: number
  energy?: number
  cost?: number
  /** Sessions that ended without a clean finish. */
  incomplete?: number
  /** Sessions whose energy was inferred from SoC rather than metered. */
  estimated?: number
}

export interface ChargingSession {
  id?: number
  startTime?: number
  endTime?: number
  inProgress?: boolean
  chargingNow?: boolean
  startSoc?: number
  endSoc?: number
  energyAdded?: number
  durationMinutes?: number
  cost?: number
  /** Symbol as the car formats it, e.g. "₫" — not a currency code. */
  currency?: string
  isDc?: boolean
  rangeGained?: number
  /** "soc_estimate" means energyAdded was inferred, not measured. */
  energySource?: string
}

export interface ChargingSummary {
  daily?: ChargingDay[]
  periodSessions?: number
  periodEnergyKwh?: number
  periodCost?: number
  periodIncompleteSessions?: number
  periodEstimatedSessions?: number
  avgCostPerKwh?: number
}

export interface ChargingOverview {
  success?: boolean
  summary?: ChargingSummary
  sessions?: ChargingSession[]
}

// --- /api/trips ---
export interface TripConfig {
  success?: boolean
  config?: {
    /** Trip recording. When false the stored rows are stale by definition. */
    enabled?: boolean
    currency?: string
    distanceUnit?: string
    electricityRate?: number
    isPhev?: boolean
  }
}

export interface TripRow {
  id?: number
  startTime?: number
  endTime?: number
  distanceKm?: number
  durationSeconds?: number
  avgSpeedKmh?: number
  maxSpeedKmh?: number
  odometerEndKm?: number
  energyUsedKwh?: number
  /** False when the energy figure was inferred rather than measured. */
  energyMetered?: boolean
  tripCost?: number
  currency?: string
}
