import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { lang, t } from '../lib/i18n'
import { IconArrow } from './icons'
import './chargingstats.css'

/** One column: a day, its value, and the letter under it. */
export interface StatBar {
  key: number
  value: number
  label: string
}

/** Local midnight — the key days are bucketed by on both sides. */
export function dayKey(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "Sat 5 Sep" — enough to identify a column without crowding it. */
export function fmtDayLabel(ms: number): string {
  return new Intl.DateTimeFormat(lang.value === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(ms))
}

/** Narrow weekday initial for the axis. */
export function dayInitial(ms: number): string {
  return new Intl.DateTimeFormat(lang.value === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'narrow',
  }).format(new Date(ms))
}

/**
 * A round axis top, and the gridlines to match.
 *
 * Scaling straight to the tallest bar makes every chart look identical no
 * matter how much was actually recorded — 2 and 20 both fill the frame.
 * Rounding up to a whole step keeps the height meaningful between periods.
 */
export function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [4, 2, 0] }
  const raw = max / 3
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const top = step * 3
  return { top, ticks: [top, step * 2, step, 0] }
}

/**
 * Build the day window and match the source rows into it.
 *
 * Both APIs report only the days they have something for, so the window is
 * generated here — otherwise a quiet week draws three bars and silently
 * relabels the axis. A day with nothing in it becomes a real, visible zero.
 */
export function buildWindow(days: number, byDay: Map<number, number>): StatBar[] {
  const today = dayKey(Date.now())
  const out: StatBar[] = []
  for (let i = days - 1; i >= 0; i--) {
    const key = today - i * 86_400_000
    out.push({ key, value: byDay.get(key) ?? 0, label: dayInitial(key) })
  }
  return out
}

/**
 * The shared shell behind the Data tab's cards: header, totals, a day-by-day
 * bar chart you can interrogate, and a footer strip.
 *
 * Charging and trips render the same object with different numbers, so the
 * chart — including its interaction, which took three attempts to get right on
 * touch — lives here once rather than being copied and drifting.
 */
export function StatChartCard({
  icon,
  title,
  subtitle,
  chipLabel,
  href,
  hrefLabel,
  state,
  emptyText,
  totals,
  bars,
  unit,
  formatValue,
  approx,
  footer,
}: {
  icon: JSX.Element
  title: string
  subtitle: string
  chipLabel: string
  /** Where the chip goes — null when there is no car to open (demo). */
  href: string | null
  hrefLabel: string
  state: 'loading' | 'ready' | 'error'
  emptyText: string
  totals: JSX.Element
  bars: StatBar[]
  unit: string
  formatValue: (v: number) => string
  /** True when the figures are inferred rather than measured. */
  approx?: boolean
  footer?: JSX.Element | null
}) {
  const { top, ticks } = niceScale(Math.max(...bars.map((b) => b.value), 0))
  /*
   * Which column is showing its value. Hover on a pointer device, tap on a
   * touch one — the bars are a few pixels wide, and a native `title` tooltip
   * never appears on touch at all, so the number was unreachable on a phone.
   */
  const [active, setActive] = useState<number | null>(null)

  /*
   * Dismissal for touch, where there is no hover to end. A tap outside the bars
   * closes the readout; bound only while one is open, so the app is not
   * listening to every pointer event on every screen.
   */
  useEffect(() => {
    if (active === null) return
    const away = (e: PointerEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('.cs-bars')) setActive(null)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [active])

  return (
    <div class="card cs-card">
      <div class="cs-head">
        <span class="cs-badge">{icon}</span>
        <div class="cs-titles">
          <div class="cs-title">{title}</div>
          <div class="cs-sub">{subtitle}</div>
        </div>
        {href && (
          <a class="cs-period" href={href} target="_blank" rel="noopener noreferrer" aria-label={hrefLabel} title={hrefLabel}>
            {chipLabel} <IconArrow size={14} />
          </a>
        )}
      </div>

      {state === 'error' ? (
        <div class="cs-empty">{emptyText}</div>
      ) : (
        <>
          <div class="cs-totals">{totals}</div>

          {/* Gridlines and bars share one grid so a bar's height is read against
              the same rows the axis labels name — no separate scales to drift. */}
          <div class="cs-chart">
            <div class="cs-axis" aria-hidden="true">
              {ticks.map((v) => (
                <span key={v}>{v % 1 === 0 ? v : v.toFixed(1)}</span>
              ))}
            </div>
            <div class="cs-plot">
              {ticks.map((v) => (
                <div class="cs-grid" key={v} style={{ bottom: `${(v / top) * 100}%` }} />
              ))}
              {/*
                Mouse only. A touch pointer "leaves" the moment the finger lifts,
                so an unguarded handler here wiped the value the tap had just set.
                Touch keeps it until another column is tapped or the user taps away.
              */}
              <div class="cs-bars" onPointerLeave={(e) => { if (e.pointerType !== 'touch') setActive(null) }}>
                {bars.map((b, i) => {
                  const h = Math.max(b.value > 0 ? 2 : 0, (b.value / top) * 100)
                  return (
                    <button
                      class={'cs-col' + (active === i ? ' on' : '')}
                      key={b.key}
                      type="button"
                      // The whole column is the target, not the bar — a 3px zero
                      // bar is not something anyone can reliably hit.
                      onPointerEnter={(e) => { if (e.pointerType !== 'touch') setActive(i) }}
                      /*
                       * Set, never toggle. On touch the browser fires focus
                       * BEFORE click, so onFocus had already selected this
                       * column and a toggle deselected it again — the tap
                       * appeared to do nothing.
                       */
                      onClick={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                      aria-label={`${fmtDayLabel(b.key)}: ${formatValue(b.value)} ${unit}`}
                    >
                      {/* Anchored to the top of the BAR, not the column: at column
                          height a tall bar's readout landed up in the totals row. */}
                      {active === i && (
                        <span
                          class={'cs-tip' + (i === 0 ? ' at-start' : '') + (i === bars.length - 1 ? ' at-end' : '')}
                          style={{ bottom: `calc(${h}% + 8px)` }}
                        >
                          <b>
                            {approx && b.value > 0 ? '≈ ' : ''}
                            {formatValue(b.value)} {unit}
                          </b>
                          <i>{fmtDayLabel(b.key)}</i>
                        </span>
                      )}
                      {/* Today is emphasised only if something actually
                          happened. A zero day that glows reads as activity —
                          the last column lit up on a day with no charging at
                          all, which is precisely the wrong signal. */}
                      <span
                        class={
                          'cs-bar' +
                          (i === bars.length - 1 && b.value > 0 ? ' now' : '') +
                          (b.value > 0 ? '' : ' zero')
                        }
                        style={{ height: `${h}%` }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
            <div class="cs-unit" aria-hidden="true">{unit}</div>
            <div class="cs-labels">
              {bars.map((b) => (
                <span key={b.key}>{b.label}</span>
              ))}
            </div>
          </div>

          {footer}
        </>
      )}
    </div>
  )
}

/** Shared by both cards' footers. */
export function fmtDuration(min: number): string {
  const total = Math.round(min)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function fmtMoney(v: number, currency: string): string {
  const locale = lang.value === 'vi' ? 'vi-VN' : 'en-US'
  return `${Math.round(v).toLocaleString(locale)} ${currency}`
}

/** Days-window subtitle, shared wording. */
export function windowLabel(days: number): string {
  return t('data.last_days', { n: days })
}
