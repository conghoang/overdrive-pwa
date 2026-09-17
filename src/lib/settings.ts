import { signal } from '@preact/signals'
import { idbDel, idbGet, idbSet } from './idb'

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
 * Live-view fisheye correction, 0-100, stored PER CAMERA.
 *
 * Each lens sits at a different angle behind a different piece of glass, so one
 * number cannot suit them all — the front camera needs a different correction
 * from the side ones, and the mosaic is four lenses at once. Keyed by view mode.
 *
 * A view with no entry follows the car's own recording.rectifyStrength, so a
 * camera the user has never touched still starts somewhere sensible, and
 * clearing an entry returns it to following the car.
 */
const K_DEWARP = 'odpwa.dewarp'
type DewarpMap = Record<string, number>

function readDewarp(): DewarpMap {
  try {
    const raw = localStorage.getItem(K_DEWARP)
    if (!raw) return {}
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object') return {}
    const out: DewarpMap = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(100, v))
    }
    return out
  } catch {
    return {} // corrupt or unreadable storage should not break the camera
  }
}

export const dewarpByView = signal<DewarpMap>(readDewarp())

export function setDewarpFor(mode: number, v: number): void {
  const next = { ...dewarpByView.value, [String(mode)]: Math.max(0, Math.min(100, v)) }
  dewarpByView.value = next
  try {
    localStorage.setItem(K_DEWARP, JSON.stringify(next))
  } catch {
    /* not fatal: it still applies for this session */
  }
}

/*
 * Optional user-supplied car photo, overriding the bundled default.
 *
 * The blob lives in IndexedDB (bytes, ~no practical size limit); the signal
 * carries an object URL for <img src>. It was a data URL in localStorage,
 * which capped the photo at a few MB once base64 inflation and UTF-16 storage
 * were counted — initCarPhoto() migrates any leftover.
 */
const K_CARPHOTO = 'odpwa.carPhoto' // legacy localStorage key (migrated away)
const IDB_CARPHOTO = 'carPhoto'
export const carPhoto = signal<string | null>(null)

/** Swap in a new object URL, releasing the previous one so blobs aren't leaked. */
function setPhotoUrl(next: string | null): void {
  const prev = carPhoto.value
  carPhoto.value = next
  if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
}

export async function setCarPhoto(blob: Blob | null): Promise<void> {
  // Persist first — if the write fails, the signal stays unchanged so the UI
  // never shows a photo that wasn't actually saved.
  if (blob) await idbSet(IDB_CARPHOTO, blob)
  else await idbDel(IDB_CARPHOTO)
  setPhotoUrl(blob ? URL.createObjectURL(blob) : null)
}

/**
 * Load the stored photo (and migrate a legacy data URL into IndexedDB).
 * Async, so the first paint uses the bundled default and swaps in once ready.
 */
export async function initCarPhoto(): Promise<void> {
  try {
    const legacy = localStorage.getItem(K_CARPHOTO)
    if (legacy) {
      try {
        // Convert and store BEFORE dropping the old copy, so a failure here
        // can't lose the user's photo — it just stays for the next attempt.
        const blob = await (await fetch(legacy)).blob()
        await idbSet(IDB_CARPHOTO, blob)
        localStorage.removeItem(K_CARPHOTO)
      } catch { /* keep the legacy value; retry on the next launch */ }
    }
    const blob = await idbGet<Blob>(IDB_CARPHOTO)
    if (blob) setPhotoUrl(URL.createObjectURL(blob))
    else if (legacy) setPhotoUrl(legacy) // migration failed; a data URL still renders
  } catch {
    // Private mode / IDB unavailable: fall back to the legacy value if there is
    // one, otherwise the bundled default photo.
    const legacy = localStorage.getItem(K_CARPHOTO)
    if (legacy) setPhotoUrl(legacy)
  }
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

/*
 * Validate, don't assert.
 *
 * These entries become a shell line on the head unit, and the old code took
 * whatever JSON.parse returned and cast it to WcCommand[]. localStorage is not
 * a trusted store — the app lives on a *.github.io origin it shares with every
 * other Pages site on the account, and localStorage is scoped to the origin,
 * not the path. Anything that can write this key could otherwise leave a button
 * still labelled "Unlock" that runs something else entirely.
 */
function isCommand(v: unknown): v is WcCommand {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.label === 'string' &&
    (c.kind === 'shell' || c.kind === 'openApp') &&
    typeof c.value === 'string' &&
    (c.icon === undefined || typeof c.icon === 'string')
  )
}

function loadCommands(): WcCommand[] {
  try {
    const raw = localStorage.getItem(K_CMDS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const clean = parsed.filter(isCommand)
        // All-or-nothing: a partially readable list would silently drop buttons
        // the owner configured, which is worse than falling back to defaults.
        if (clean.length && clean.length === parsed.length) return clean
      }
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

/**
 * Put every car-linked setting back to its default.
 *
 * clearAll() empties the storage, but these signals are already in memory —
 * without this the sign-out screen keeps showing the old car's photo and name
 * until the page happens to reload.
 */
export function resetSettings(): void {
  // The photo is a real picture of the car, plate and all — clearAll() only
  // empties localStorage, so delete the IndexedDB copy here too or signing out
  // on a sold/borrowed phone leaves it behind.
  setPhotoUrl(null)
  void idbDel(IDB_CARPHOTO).catch(() => {})
  carName.value = ''
  showMap.value = false
  wicarlink.value = false
  dewarpByView.value = {}
  wcCommands.value = DEFAULT_WC_COMMANDS.map((c) => ({ ...c }))
}

export function newCommandId(): string {
  return 'c' + Math.abs(Date.now() ^ (performance.now() * 1000)).toString(36)
}
