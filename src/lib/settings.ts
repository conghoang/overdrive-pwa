import { signal } from '@preact/signals'

// Local-only settings, persisted in localStorage (not sent to the car).

const K_WICARLINK = 'odpwa.wicarlink'
const K_CMDS = 'odpwa.wicarlink.cmds'

export const wicarlink = signal<boolean>(localStorage.getItem(K_WICARLINK) === '1')

// Car illustration colour (Device tab), persisted.
const K_CARCOLOR = 'odpwa.carColor'
export const CAR_COLORS = ['#e9edf1', '#15191f', '#7b8794', '#2f5d8a', '#2f6b52', '#9e2b2b', '#c9a227', '#d94f6a']
export const carColor = signal<string>(localStorage.getItem(K_CARCOLOR) || '#2f5d8a')
export function setCarColor(c: string): void {
  carColor.value = c
  localStorage.setItem(K_CARCOLOR, c)
}

// Optional user-supplied car photo (data URL), overriding the bundled default.
const K_CARPHOTO = 'odpwa.carPhoto'
export const carPhoto = signal<string | null>(localStorage.getItem(K_CARPHOTO))
export function setCarPhoto(dataUrl: string | null): void {
  carPhoto.value = dataUrl
  if (dataUrl) localStorage.setItem(K_CARPHOTO, dataUrl)
  else localStorage.removeItem(K_CARPHOTO)
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
