import { useEffect, useState } from 'preact/hooks'
import * as api from '../lib/api'
import { t } from '../lib/i18n'
import type { TripRow } from '../lib/types'
import { IconBack } from './icons-extra'
import { TripCard } from './TripCard'
import './tripcard.css'

const DAYS = 30

/** Full trip history: a scrollable list of expandable trip rows. */
export function TripList({ onBack }: { onBack: () => void }) {
  const [trips, setTrips] = useState<TripRow[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let live = true
    api
      .getTrips(DAYS)
      .then((list) => {
        if (!live) return
        setTrips([...list].sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0)))
        setState('ready')
      })
      .catch(() => { if (live) setState('error') })
    return () => { live = false }
  }, [])

  return (
    <div class="screen">
      <div class="screen-head">
        <button class="tl-back" onClick={onBack} aria-label="Back"><IconBack size={22} /></button>
        <div>
          <h1 class="screen-title">{t('trip.title')}</h1>
          <div class="screen-sub">{t('data.trips')}</div>
        </div>
      </div>

      {state === 'loading' && <div class="card center-note">{t('common.loading_vehicle')}</div>}
      {state === 'error' && <div class="card center-note">{t('data.no_trips')}</div>}
      {state === 'ready' && (!trips || trips.length === 0) && (
        <div class="card center-note">{t('trip.empty')}</div>
      )}
      {state === 'ready' && trips && trips.length > 0 && (
        <div class="trip-list">
          {trips.map((tr) => <TripCard key={tr.id ?? tr.startTime} trip={tr} />)}
        </div>
      )}
    </div>
  )
}
