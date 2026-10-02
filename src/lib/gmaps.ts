/*
 * Google Maps JavaScript API loader + reverse geocoder.
 *
 * The map is opt-in and needs an owner-supplied Maps JavaScript API key (see
 * lib/settings.ts). We inject the script once and share the promise, so the map
 * card and any address lookups reuse a single load. The key only ever goes to
 * Google's own maps.googleapis.com — it is never sent to the car.
 *
 * Google's API can only be loaded once per page. If the owner changes the key,
 * the already-loaded namespace keeps using the first key until the next reload
 * — we resolve with whatever is loaded rather than injecting a second copy
 * (which Google rejects with a console warning).
 */

// The google.maps namespace, left untyped so the app needn't carry the large
// @types/google.maps dependency for a single opt-in screen.
/* eslint-disable @typescript-eslint/no-explicit-any */
type GMaps = any

declare global {
  interface Window {
    google?: { maps?: GMaps }
    __odpwaGmapsCb?: () => void
  }
}

let loadPromise: Promise<GMaps> | null = null

/** Load (or reuse) the Google Maps JS API and resolve with the `google.maps` namespace. */
export function loadGoogleMaps(key: string): Promise<GMaps> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('no document'))
  }
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (loadPromise) return loadPromise
  if (!key) return Promise.reject(new Error('no key'))

  loadPromise = new Promise<GMaps>((resolve, reject) => {
    const CB = '__odpwaGmapsCb'
    window[CB] = () => {
      if (window.google?.maps) resolve(window.google.maps)
      else reject(new Error('maps failed to initialise'))
    }
    const s = document.createElement('script')
    s.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(key)}&loading=async&callback=${CB}`
    s.async = true
    s.onerror = () => {
      loadPromise = null // let a later attempt retry after a transient failure
      reject(new Error('maps script failed to load'))
    }
    document.head.appendChild(s)
  })
  return loadPromise
}

/** Street address for a coordinate, or null if none could be resolved. */
export async function reverseGeocode(
  maps: GMaps,
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const geocoder = new maps.Geocoder()
    const res: any = await geocoder.geocode({ location: { lat, lng } })
    const first = res?.results?.[0]
    return (first?.formatted_address as string) ?? null
  } catch {
    return null // keyless, over-quota, or no result — the card just omits the line
  }
}
