import { t as tr } from './i18n'
import type { TyreCorner } from './types'

export function fmtDistance(km: number | undefined | null, unit = 'km'): string {
  if (km == null || Number.isNaN(km)) return '--'
  if (unit === 'mi') return String(Math.round(km * 0.621371))
  return String(Math.round(km))
}

export function distanceUnitLabel(unit = 'km'): string {
  return unit === 'mi' ? 'mi' : 'km'
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
  if (ms < 0) return tr('ago.now')
  const s = Math.floor(ms / 1000)
  if (s < 60) return tr('ago.s', { n: s })
  const m = Math.floor(s / 60)
  if (m < 60) return tr('ago.m', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return tr('ago.h', { n: h })
  return tr('ago.d', { n: Math.floor(h / 24) })
}

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

/** Minutes → "2h 15m" / "45m". */
export function fmtEta(min: number | undefined | null): string {
  if (!min || min <= 0) return ''
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
