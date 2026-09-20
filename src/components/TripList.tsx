import { useEffect, useState } from 'preact/hooks'
import * as api from '../lib/api'
import { t } from '../lib/i18n'
import type { TripRow } from '../lib/types'
import { IconBack } from './icons-extra'
import { TripCard } from './TripCard'
import './tripcard.css'

const FETCH_DAYS = 30
const WINDOWS = [7, 30] as const
type Days = (typeof WINDOWS)[number]

/** Full trip history: a scrollable list of expandable rows, filterable 7D/30D. */
export function TripList({ onBack }: { onBack: () => void }) {
  const [trips, setTrips] = useState<TripRow[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [days, setDays] = useState<Days>(7)

  useEffect(() => {
    let live = true
    api
      .getTrips(FETCH_DAYS)
      .then((list) => {
        if (!live) return
        setTrips([...list].sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0)))
        setState('ready')
      })
      .catch(() => { if (live) setState('error') })
    return () => { live = false }
  }, [])

  // Filter is client-side over the 30-day fetch, so switching windows is instant.
  const cutoff = Date.now() - days * 86_400_000
  const shown = (trips ?? []).filter((tr) => (tr.startTime ?? 0) >= cutoff)

  return (
    <div class="screen">
      <div class="screen-head">
        <div class="tl-head-left">
          <button class="tl-back" onClick={onBack} aria-label="Back"><IconBack size={22} /></button>
          <div>
            <h1 class="screen-title">{t('trip.title')}</h1>
            <div class="screen-sub">
              {state === 'ready' ? `${shown.length} ${t('data.trips_n', { n: shown.length })}` : t('data.trips')}
            </div>
          </div>
        </div>
        <div class="tl-filter" role="tablist">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={days === w}
              class={days === w ? 'active' : ''}
              onClick={() => setDays(w)}
            >
              {w}D
            </button>
          ))}
        </div>
      </div>

      {state === 'loading' && <div class="card center-note">{t('common.loading_vehicle')}</div>}
      {state === 'error' && <div class="card center-note">{t('data.no_trips')}</div>}
      {state === 'ready' && shown.length === 0 && <div class="card center-note">{t('trip.empty')}</div>}
      {state === 'ready' && shown.length > 0 && (
        <div class="trip-list">
          {shown.map((tr) => <TripCard key={tr.id ?? tr.startTime} trip={tr} />)}
        </div>
      )}
    </div>
  )
}
