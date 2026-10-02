import { useEffect, useRef, useState } from 'preact/hooks'
import { t } from '../lib/i18n'
import { gmapsKey } from '../lib/settings'
import { resolvedTheme } from '../lib/theme'
import { loadGoogleMaps, reverseGeocode } from '../lib/gmaps'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Interactive Google map of where the car is — pan, pinch/scroll zoom, a
 * recentre button and the street address, matching OverDrive's dashboard.
 *
 * Google Maps is loaded LAZILY and only when the owner has supplied a Maps
 * JavaScript API key (Settings → Show map): the map is opt-in, so no one else
 * downloads the library or sends the car's location to Google. With no key the
 * card shows a short hint instead.
 */

const ZOOM = 16

// A muted dark basemap for the dark theme; the light theme uses Google's
// default styling (the previous OSM build darkened light tiles with a CSS
// filter — Google styles the map itself, so markers and labels stay crisp).
const DARK_STYLE: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#1b232c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#10161d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8aa0b2' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a333d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9fb2c2' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4651' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e151c' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#171e26' }] },
]

export function MiniMap({ lat, lng, height = 180 }: { lat: number; lng: number; height?: number }) {
  const key = gmapsKey.value
  const hostRef = useRef<HTMLDivElement | null>(null)
  // Keep the live map + marker across renders without re-creating them.
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [address, setAddress] = useState<string | null>(null)

  // Create once, when a key is present.
  useEffect(() => {
    if (!key) return
    let cancelled = false
    ;(async () => {
      try {
        const maps = await loadGoogleMaps(key)
        if (cancelled || !hostRef.current || mapRef.current) return

        const map = new maps.Map(hostRef.current, {
          center: { lat, lng },
          zoom: ZOOM,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
          // One finger scrolls the page; two fingers pan the map (and ctrl/⌘ +
          // wheel zooms) — the right behaviour for a small map inside a
          // scrolling dashboard.
          gestureHandling: 'cooperative',
          clickableIcons: false,
          keyboardShortcuts: false,
          styles: resolvedTheme.value === 'dark' ? DARK_STYLE : undefined,
        })

        markerRef.current = new maps.Marker({
          position: { lat, lng },
          map,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#35dfc1',
            fillOpacity: 1,
            strokeColor: '#04121a',
            strokeWeight: 2,
          },
        })

        mapRef.current = map
        setReady(true)

        // Street address, best-effort: a failure just omits the line.
        reverseGeocode(maps, lat, lng).then((a) => {
          if (!cancelled) setAddress(a)
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Follow the car without fighting a user who has panned away: move the marker
  // and re-resolve the address, but leave the viewport where they left it.
  useEffect(() => {
    markerRef.current?.setPosition({ lat, lng })
    if (mapRef.current && window.google?.maps) {
      reverseGeocode(window.google.maps, lat, lng).then(setAddress)
    }
  }, [lat, lng])

  // Opt-in but no key yet: tell the owner where to add one rather than showing
  // a blank card.
  if (!key) {
    return (
      <div class="minimap minimap-hint" style={{ minHeight: `${height}px` }}>
        <span>{t('loc.map_needs_key')}</span>
      </div>
    )
  }

  if (failed) {
    return (
      <div class="minimap minimap-hint" style={{ minHeight: `${height}px` }}>
        <span>{t('loc.map_failed')}</span>
      </div>
    )
  }

  return (
    <>
      <div class="minimap" style={{ minHeight: `${height}px` }}>
        <div ref={hostRef} class="minimap-host" />
        {ready && (
          <button
            class="minimap-recenter"
            title={t('loc.recenter')}
            aria-label={t('loc.recenter')}
            onClick={() => {
              mapRef.current?.setCenter({ lat, lng })
              mapRef.current?.setZoom(ZOOM)
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2v3M12 19v3M22 12h-3M5 12H2" stroke-linecap="round" />
            </svg>
          </button>
        )}
      </div>
      {address && <div class="loc-address">{address}</div>}
    </>
  )
}
