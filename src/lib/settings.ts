import { signal } from '@preact/signals'

// Local-only settings, persisted in localStorage (not sent to the car).

const K_WICARLINK = 'odpwa.wicarlink'
const K_CMDS = 'odpwa.wicarlink.cmds'

export const wicarlink = signal<boolean>(localStorage.getItem(K_WICARLINK) === '1')

// User-chosen name for the car, shown as the Vehicle tab's title. Empty = use
// the default localised "Vehicle".
const K_CARNAME = 'odpwa.carName'
export const carName = signal<string>(localStorage.getItem(K_CARNAME) || '')
export function setCarName(name: string): void {
  const v = name.trim().slice(0, 28)
  carName.value = v
  if (v) localStorage.setItem(K_CARNAME, v)
  else localStorage.removeItem(K_CARNAME)
}

// Opt-in mini map on the Vehicle tab (off by default: it fetches map tiles).
const K_MAP = 'odpwa.map'
export const showMap = signal<boolean>(localStorage.getItem(K_MAP) === '1')
export function setShowMap(on: boolean): void {
  showMap.value = on
  localStorage.setItem(K_MAP, on ? '1' : '0')
}

/*
 * Live-view fisheye correction, 0-100.
 *
 * null means "follow the car" — the camera screen then uses the car's own
 * recording.rectifyStrength. Storing null rather than resolving it at first run
 * means changing the setting on the car keeps carrying over, until the user
 * moves this slider and states a preference of their own.
 */
const K_DEWARP = 'odpwa.dewarp'
function readDewarp(): number | null {
  const raw = localStorage.getItem(K_DEWARP)
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
}
export const dewarpStrength = signal<number | null>(readDewarp())
export function setDewarpStrength(v: number | null): void {
  dewarpStrength.value = v
  if (v == null) localStorage.removeItem(K_DEWARP)
  else localStorage.setItem(K_DEWARP, String(v))
}

// Optional user-supplied car photo (data URL), overriding the bundled default.
const K_CARPHOTO = 'odpwa.carPhoto'
export const carPhoto = signal<string | null>(localStorage.getItem(K_CARPHOTO))
export function setCarPhoto(dataUrl: string | null): void {
  // Persist first — if localStorage throws (quota), the signal stays unchanged
  // so the UI never shows a photo that wasn't actually saved.
  if (dataUrl) localStorage.setItem(K_CARPHOTO, dataUrl)
  else localStorage.removeItem(K_CARPHOTO)
  carPhoto.value = dataUrl
}

export function setWicarlink(on: boolean): void {
  wicarlink.value = on
  localStorage.setItem(K_WICARLINK, on ? '1' : '0')
}

export type WcKind = 'openApp' | 'shell'

export interface WcCommand {
  id: string
  label: string
  kind: WcKind
  /** package name (openApp) or a shell/adb command run on the head unit (shell). */
  value: string
  icon: string
}

// 51DK / WiCarlink commands. Each fires an intent at the WiCarlink LauncherActivity
// with a `cmd` extra. These are `am start` (shell) commands, so they need OD's
// "Advanced actions" enabled (Key Mapping → allowAdvanced). All editable locally.
const WC_ACTIVITY = 'com.wicarlink.digitalcarkey/.ui.activity.LauncherActivity'
const wc = (cmd: string): string => `am start -n ${WC_ACTIVITY} --es cmd ${cmd}`

export const DEFAULT_WC_COMMANDS: WcCommand[] = [
  { id: 'bton', label: 'Bluetooth on', kind: 'shell', value: wc('bton'), icon: 'bluetooth' },
  { id: 'unlock', label: 'Unlock', kind: 'shell', value: wc('unlock'), icon: 'unlock' },
  { id: 'lock', label: 'Lock', kind: 'shell', value: wc('lock'), icon: 'lock' },
  { id: 'startstop', label: 'Start / Stop', kind: 'shell', value: wc('start'), icon: 'bolt' },
  { id: 'trunk', label: 'Trunk', kind: 'shell', value: wc('trunk'), icon: 'trunk' },
  { id: 'carwash_on', label: 'Car wash ON', kind: 'shell', value: wc('carwash_on'), icon: 'wind' },
  { id: 'carwash_off', label: 'Car wash OFF', kind: 'shell', value: wc('carwash_off'), icon: 'wind' },
  { id: 'manual', label: 'Manual mode', kind: 'shell', value: wc('manual'), icon: 'sliders' },
]

function loadCommands(): WcCommand[] {
  try {
    const raw = localStorage.getItem(K_CMDS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) return parsed as WcCommand[]
    }
  } catch { /* ignore */ }
  return DEFAULT_WC_COMMANDS.map((c) => ({ ...c }))
}

export const wcCommands = signal<WcCommand[]>(loadCommands())

export function saveCommands(cmds: WcCommand[]): void {
  wcCommands.value = cmds
  localStorage.setItem(K_CMDS, JSON.stringify(cmds))
}

export function resetCommands(): void {
  localStorage.removeItem(K_CMDS)
  wcCommands.value = DEFAULT_WC_COMMANDS.map((c) => ({ ...c }))
}

export function newCommandId(): string {
  return 'c' + Math.abs(Date.now() ^ (performance.now() * 1000)).toString(36)
}
