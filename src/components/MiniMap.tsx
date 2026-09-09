/**
 * Small dark map showing where the car is parked.
 *
 * Deliberately no map library: at this size all we need is a grid of raster
 * tiles positioned so the car sits dead centre, which is ~30 lines of slippy-map
 * maths instead of a 148 KB Leaflet dependency.
 *
 * Tiles come from OpenStreetMap (free, no API key) and are darkened in CSS to
 * match the app. NOTE: OverDrive's own dashboard points at CARTO's dark basemap,
 * but those now render an "API KEY REQUIRED" watermark, so they're unusable
 * without an account.
 *
 * Only rendered when the user opts in (Settings → Show map), because it fetches
 * third-party tiles.
 */

const TILE = 256
const ZOOM = 15

const lonToTileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const latToTileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

export function MiniMap({ lat, lng, height = 150 }: { lat: number; lng: number; height?: number }) {
  // Centre tile, in fractional tile units.
  const fx = lonToTileX(lng, ZOOM)
  const fy = latToTileY(lat, ZOOM)
  const cx = Math.floor(fx)
  const cy = Math.floor(fy)
  // Where the car sits inside its own tile, in px.
  const offX = (fx - cx) * TILE
  const offY = (fy - cy) * TILE

  // Enough tiles to cover a wide container at any phone width.
  const cols = [-2, -1, 0, 1, 2]
  const rows = [-1, 0, 1]

  const maxIndex = 2 ** ZOOM

  return (
    <div class="minimap" style={{ height: `${height}px` }}>
      <div class="minimap-tiles">
        {rows.map((ry) =>
          cols.map((rx) => {
            const tx = ((cx + rx) % maxIndex + maxIndex) % maxIndex // wrap the globe
            const ty = cy + ry
            if (ty < 0 || ty >= maxIndex) return null
            return (
              <img
                key={`${rx}_${ry}`}
                class="minimap-tile"
                src={`https://tile.openstreetmap.org/${ZOOM}/${tx}/${ty}.png`}
                width={TILE}
                height={TILE}
                loading="lazy"
                alt=""
                style={{
                  // Centre the car: shift each tile by its offset from centre.
                  left: `calc(50% + ${rx * TILE - offX}px)`,
                  top: `calc(50% + ${ry * TILE - offY}px)`,
                }}
              />
            )
          }),
        )}
      </div>
      <div class="minimap-pin" aria-hidden="true">
        <span class="minimap-pulse" />
        <span class="minimap-dot" />
      </div>
      <div class="minimap-credit">© OpenStreetMap</div>
    </div>
  )
}
