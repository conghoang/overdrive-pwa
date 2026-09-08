export function fmtDistance(km: number | undefined | null, unit = 'km'): string {
  if (km == null || Number.isNaN(km)) return '--'
  if (unit === 'mi') return String(Math.round(km * 0.621371))
  return String(Math.round(km))
}

export function distanceUnitLabel(unit = 'km'): string {
  return unit === 'mi' ? 'mi' : 'km'
}

export function fmtPercent(p: number | undefined | null): string {
  if (p == null || Number.isNaN(p)) return '--'
  return String(Math.round(p))
}

export function fmtNum(n: number | undefined | null, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '--'
  return n.toFixed(digits)
}

export function fmtTemp(c: number | undefined | null): string {
  if (c == null || Number.isNaN(c)) return '--'
  return `${Math.round(c)}°`
}

/** Coarse ago-string from an epoch-ms timestamp. */
export function ago(ts: number | undefined | null): string {
  if (!ts) return ''
  const ms = Date.now() - ts
  if (ms < 0) return 'just now'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

import type { TyreCorner } from './types'

export function pressureUnitLabel(unit = 'kpa'): string {
  if (unit === 'psi') return 'psi'
  if (unit === 'bar') return 'bar'
  return 'kPa'
}

export function fmtPressure(t: TyreCorner | undefined, unit = 'kpa'): string {
  if (!t || !t.available || t.kPa == null) return '--'
  if (unit === 'psi') return String(t.psi ?? Math.round(t.kPa * 0.1450377 * 10) / 10)
  if (unit === 'bar') return (t.kPa / 100).toFixed(2)
  return String(Math.round(t.kPa))
}

export function fmtDuration(sec: number | undefined | null): string {
  if (!sec || sec < 0) return '--'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
