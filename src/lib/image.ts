/**
 * Read an image File, downscale to `maxW`, and return an encoded Blob.
 *
 * Prefers WebP — it keeps transparency AND is the smallest of the three, so a
 * PNG car render with a see-through background survives intact instead of
 * flattening to black (a JPEG has no alpha channel, so transparent pixels keep
 * their RGB and come out as black). Browsers that can't encode WebP (notably
 * Safari) silently hand back a PNG rather than failing, so the result type is
 * checked and re-encoded explicitly: PNG when transparent, JPEG when opaque —
 * PNG for an opaque photo measured ~8x larger with nothing to preserve.
 *
 * `maxW` default 800 suits the app: the photo renders at most 380 CSS px
 * (hero) / 300 px (settings), so 800 stays crisp at 2–3× DPR without bloat.
 *
 * Returns a Blob, not a data URL: it goes to IndexedDB, which stores bytes
 * directly — no base64 inflation and no localStorage quota to dance around.
 */
export function fileToResizedBlob(file: File, maxW = 800): Promise<Blob> {
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

      const done = (blob: Blob | null) =>
        blob ? resolve(blob) : reject(new Error('encode failed'))

      canvas.toBlob((webp) => {
        // Unsupported type → the browser encodes PNG instead of erroring, so
        // trust the resulting type rather than the type we asked for.
        if (webp && webp.type === 'image/webp') return done(webp)
        if (hasAlpha) return canvas.toBlob(done, 'image/png')
        canvas.toBlob(done, 'image/jpeg', 0.82)
      }, 'image/webp', 0.85)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('could not load image'))
    }
    img.src = url
  })
}
