import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { lang, t } from '../lib/i18n'
import { IconBack } from './icons-extra'
import './tripcard.css'

const FETCH_DAYS = 30
const WINDOWS = [7, 30] as const
type Days = (typeof WINDOWS)[number]

const loc = () => (lang.value === 'vi' ? 'vi-VN' : 'en-US')
const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime() }
function dayLabel(dayMs: number): string {
  const today = startOfDay(Date.now())
  if (dayMs === today) return t('common.today')
  if (dayMs === today - 86_400_000) return t('common.yesterday')
  return new Date(dayMs).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Shimmering placeholders shaped like the real grouped rows. */
function Skeleton() {
  const row = (k: number) => (
    <div class="skel-row" key={k}>
      <div class="skel-top"><span class="sk sk-time" /><span class="sk sk-dist" /></div>
      <div class="skel-chips"><span class="sk sk-chip" /><span class="sk sk-chip" /></div>
    </div>
  )
  const group = (g: number, rows: number) => (
    <section class="hist-group" key={g}>
      <div class="hist-day"><span class="sk sk-day" /></div>
      <div class="trip-list">{Array.from({ length: rows }, (_, i) => row(g * 10 + i))}</div>
    </section>
  )
  return <>{group(0, 3)}{group(1, 2)}</>
}

export interface HistoryListProps<T> {
  title: string
  onBack: () => void
  load: (days: number) => Promise<T[]>
  startTimeOf: (item: T) => number | undefined
  renderRow: (item: T) => JSX.Element
  /** Per-day subtotal shown on the group header (e.g. total km / kWh). */
  daySummary: (items: T[]) => JSX.Element
  countLabel: (n: number) => string
  emptyText: string
  /** Optional controls shown in their own row under the header (e.g. a view toggle). */
  toolbar?: JSX.Element
}

/** A back-headed, 7D/30D-filterable history list, grouped under date headers. */
export function HistoryList<T>(props: HistoryListProps<T>) {
  const { title, onBack, load, startTimeOf, renderRow, daySummary, countLabel, emptyText, toolbar } = props
  const [items, setItems] = useState<T[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [days, setDays] = useState<Days>(7)

  useEffect(() => {
    let live = true
    load(FETCH_DAYS)
      .then((list) => {
        if (!live) return
        setItems([...list].sort((a, b) => (startTimeOf(b) ?? 0) - (startTimeOf(a) ?? 0)))
        setState('ready')
      })
      .catch(() => { if (live) setState('error') })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cutoff = Date.now() - days * 86_400_000
  const shown = (items ?? []).filter((x) => (startTimeOf(x) ?? 0) >= cutoff)

  const map = new Map<number, T[]>()
  for (const x of shown) {
    const ts = startTimeOf(x)
    if (ts == null) continue
    const k = startOfDay(ts)
    const arr = map.get(k)
    if (arr) arr.push(x); else map.set(k, [x])
  }
  const groups = [...map.entries()].sort((a, b) => b[0] - a[0]).map(([day, its]) => ({ day, items: its }))

  return (
    <div class="screen">
      <div class="screen-head">
        <div class="tl-head-left">
          <button class="tl-back" onClick={onBack} aria-label="Back"><IconBack size={22} /></button>
          <div>
            <h1 class="screen-title">{title}</h1>
            <div class="screen-sub">{state === 'ready' ? countLabel(shown.length) : '—'}</div>
          </div>
        </div>
        <div class="tl-filter" role="tablist">
          {WINDOWS.map((w) => (
            <button key={w} type="button" role="tab" aria-selected={days === w}
              class={days === w ? 'active' : ''} onClick={() => setDays(w)}>{w}D</button>
          ))}
        </div>
      </div>

      {toolbar && <div class="hist-toolbar">{toolbar}</div>}

      {state === 'loading' && <Skeleton />}
      {state === 'error' && <div class="card center-note">{emptyText}</div>}
      {state === 'ready' && groups.length === 0 && <div class="card center-note">{emptyText}</div>}
      {state === 'ready' && groups.map((g) => (
        <section class="hist-group" key={g.day}>
          <div class="hist-day">
            <span class="hist-day-label">{dayLabel(g.day)}</span>
            <span class="hist-day-sum">{daySummary(g.items)}</span>
          </div>
          <div class="trip-list">{g.items.map(renderRow)}</div>
        </section>
      ))}
    </div>
  )
}
