/**
 * Cap for a stored data URL, in STRING LENGTH.
 *
 * localStorage quotas are ~5 MB, but browsers store strings as UTF-16, so a
 * character costs ~2 bytes — the real ceiling is ~2.6M chars, not 5M. 2M leaves
 * room for the JWT and the rest of the odpwa.* settings. (The old 3.5M guard was
 * above the actual quota, so an oversized image threw a raw QuotaExceededError
 * from setItem instead of being caught and re-encoded here.)
 */
const MAX_DATA_URL_CHARS = 2_000_000

/**
 * Read an image File, downscale to `maxW`, and return a compact data URL.
 *
 * Prefers WebP — it keeps transparency AND is the smallest of the three, so a
 * PNG car render with a see-through background survives intact instead of
 * flattening to black (the old JPEG path had no alpha). Browsers that can't
 * encode WebP (notably Safari, which silently hands back a PNG for an
 * unsupported type) fall back to PNG when transparent / JPEG when opaque.
 *
 * `maxW` default 800 suits the app: the photo renders at most 380 CSS px
 * (hero) / 300 px (settings), so 800 stays crisp at 2–3× DPR without bloat.
 */
export function fileToResizedDataUrl(file: File, maxW = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxW / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no canvas'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Does the image actually have transparency? (JPEG can't carry it, so this
      // decides the non-WebP fallback format.)
      let hasAlpha = false
      try {
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 255) { hasAlpha = true; break }
        }
      } catch { /* local file → never tainted; ignore */ }

      // WebP first: keeps alpha and is smallest. If the browser can't encode it
      // it silently returns a PNG, so verify the result really is WebP; if not,
      // pick PNG (transparent) or JPEG (opaque) explicitly.
      let out = canvas.toDataURL('image/webp', 0.85)
      if (!out.startsWith('data:image/webp')) {
        out = hasAlpha
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', 0.82)
      }

      // A transparent PNG fallback can be large (measured: ~410k chars for a car
      // render, ~1.1M for a photo). If it would blow the storage budget, flatten
      // onto white (destination-over paints behind the car) and fall back to
      // JPEG — white, not black.
      if (hasAlpha && out.length > MAX_DATA_URL_CHARS) {
        ctx.globalCompositeOperation = 'destination-over'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.globalCompositeOperation = 'source-over'
        out = canvas.toDataURL('image/jpeg', 0.82)
      }

      if (out.length > MAX_DATA_URL_CHARS) {
        const err = new Error('QuotaExceeded: image too large')
        err.name = 'QuotaExceededError'
        return reject(err)
      }
      resolve(out)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('could not load image'))
    }
    img.src = url
  })
}
