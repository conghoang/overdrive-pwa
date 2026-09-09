import { useEffect, useRef, useState } from 'preact/hooks'
import { t } from '../lib/i18n'

/**
 * Interactive map of where the car is — pan, pinch/scroll zoom and a recentre
 * button, matching OverDrive's dashboard.
 *
 * Leaflet is imported LAZILY: the map is opt-in, so users who leave it off never
 * download the ~150 KB library or its CSS. Tiles are OpenStreetMap's (free, no
 * key) darkened in CSS — CARTO's dark basemap, which OD points at, now stamps an
 * "API KEY REQUIRED" watermark.
 */

const ZOOM = 16

export function MiniMap({ lat, lng, height = 180 }: { lat: number; lng: number; height?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  // Keep the live map + marker across renders without re-creating them.
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').CircleMarker | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // Create once.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const L = (await import('leaflet')).default
        await import('leaflet/dist/leaflet.css')
        if (cancelled || !hostRef.current || mapRef.current) return

        const map = L.map(hostRef.current, {
          center: [lat, lng],
          zoom: ZOOM,
          zoomControl: false,
          attributionControl: false,
          // A one-finger drag inside a scrolling page should scroll the page;
          // two fingers pan the map. Scroll-wheel zoom needs no modifier here
          // because the map is short and easy to scroll past.
          dragging: true,
        })
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          className: 'osm-dark', // CSS darkens just the tiles
        }).addTo(map)
        L.control.zoom({ position: 'bottomright' }).addTo(map)
        L.control.attribution({ position: 'bottomleft', prefix: false }).addAttribution('© OpenStreetMap').addTo(map)

        markerRef.current = L.circleMarker([lat, lng], {
          radius: 7,
          color: '#04121a',
          weight: 2,
          fillColor: '#35dfc1',
          fillOpacity: 1,
        }).addTo(map)

        mapRef.current = map
        setReady(true)
        // The container animates in; make sure Leaflet measures it correctly.
        setTimeout(() => map.invalidateSize(), 60)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follow the car without fighting a user who has panned away.
  useEffect(() => {
    markerRef.current?.setLatLng([lat, lng])
  }, [lat, lng])

  if (failed) return null

  return (
    <div class="minimap" style={{ height: `${height}px` }}>
      <div ref={hostRef} class="minimap-host" />
      {ready && (
        <button
          class="minimap-recenter"
          title={t('loc.recenter')}
          aria-label={t('loc.recenter')}
          onClick={() => mapRef.current?.setView([lat, lng], ZOOM, { animate: true })}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2v3M12 19v3M22 12h-3M5 12H2" stroke-linecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
