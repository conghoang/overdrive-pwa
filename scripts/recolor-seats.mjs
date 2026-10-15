/*
 * One-off model surgery: recolour the SL6's grey seats to the VN car's cognac
 * brown, WITHOUT touching the black dashboard.
 *
 * Seats and dash share one material (M_Interior) with a single "interior"
 * texture and all-white vertex colours, so a material tint browns the dash too.
 * Instead we recolour just the seat PIXELS in the texture. The seats occupy one
 * block of the 512x512 atlas (x 0-265, y 256-508 — found by gridding the atlas);
 * the dashboard, vents and centre console sit elsewhere and must stay black, so
 * we only touch that box. Within it, the light, near-neutral pixels (luminance
 * > 120, saturation < 0.18) are the seat faces; multiply them by the cognac tint
 * (0xb5651f / 255) — the same multiply that looked right as a material tint.
 * Dark bolster/background pixels stay put, giving cognac centres and near-black
 * bolsters like the real two-tone seat. (Recoloured pixels drop below the
 * luminance gate, so re-running is a no-op.)
 *
 * webp decode/encode needs a browser, so this uses puppeteer-core + system
 * Chrome alongside the gltf-transform + meshopt toolchain:
 *   npm i -D @gltf-transform/core @gltf-transform/extensions meshoptimizer puppeteer-core
 *   node scripts/recolor-seats.mjs
 * Writes public/neo3d/models/sealion6.glb in place, keeping meshopt compression.
 * Re-running is safe (recoloured pixels fall below the luminance gate).
 */
import puppeteer from 'puppeteer-core'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const MODEL = 'public/neo3d/models/sealion6.glb'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const doc = await io.read(MODEL)
const tex = doc.getRoot().listTextures().find((t) => t.getName() === 'interior')
if (!tex) throw new Error('interior texture not found')
const srcB64 = Buffer.from(tex.getImage()).toString('base64')
const mime = tex.getMimeType() // image/webp

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
const out = await page.evaluate(async (b64, mime) => {
  const img = new Image()
  img.src = `data:${mime};base64,${b64}`
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const x = c.getContext('2d')
  x.drawImage(img, 0, 0)
  const W = c.width, H = c.height
  const d = x.getImageData(0, 0, W, H)
  const px = d.data
  const M = [181 / 255, 101 / 255, 31 / 255] // cognac 0xb5651f as a multiply
  // Seat block of the atlas (in 512-space), scaled to the actual texture size.
  const sx = W / 512, sy = H / 512
  const BX1 = 265 * sx, BY0 = 256 * sy, BY1 = 508 * sy
  let n = 0
  for (let y = 0; y < H; y++) {
    if (y < BY0 || y > BY1) continue
    for (let xx = 0; xx <= BX1; xx++) {
      const i = (y * W + xx) * 4
      const r = px[i], g = px[i + 1], b = px[i + 2]
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const sat = mx ? (mx - mn) / mx : 0
      if (lum > 120 && sat < 0.18) { px[i] = r * M[0]; px[i + 1] = g * M[1]; px[i + 2] = b * M[2]; n++ }
    }
  }
  x.putImageData(d, 0, 0)
  return { webp: c.toDataURL('image/webp', 0.95).split(',')[1], n }
}, srcB64, mime)
await browser.close()
console.log(`recoloured ${out.n} seat pixels`)

tex.setImage(new Uint8Array(Buffer.from(out.webp, 'base64')))
tex.setMimeType('image/webp')
await io.write(MODEL, doc)
console.log('wrote', MODEL)
