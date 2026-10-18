/*
 * One-off model surgery: recolour the SL6's grey seats to the VN car's cognac
 * brown, WITHOUT touching the black dashboard — and keeping the seats' two-tone:
 * cognac fabric panels, BLACK side bolsters and headrests (as in the real car).
 *
 * Seats and dash share one material (M_Interior) with a single "interior"
 * texture and all-white vertex colours, so a material tint browns the dash too.
 * Instead we recolour just the seat PIXELS in the texture. The seats occupy one
 * block of the 512x512 atlas (x 0-265, y 256-508 — found by gridding the atlas);
 * the dashboard, vents and centre console sit elsewhere and must stay black, so
 * we only touch that box.
 *
 * Inside the box we classify each pixel BY COLOUR (the whole-block recolour this
 * replaced browned the bolsters and headrests too, which was wrong):
 *   - strongly-coloured pixels (saturation > 0.45): piping/logos — left alone;
 *   - DARK pixels (luminance < DARK_T): the black bolsters, seat sides and
 *     headrests — left as-is, so they stay black;
 *   - everything else (the light-grey fabric panels): recoloured to the cognac
 *     hue while keeping each pixel's own brightness, so creases/shading survive.
 *
 * IMPORTANT: run this against the PRISTINE pre-tint texture (the model as of the
 * last commit before any seat recolour: `git show 5ce43f2:public/neo3d/models/
 * sealion6.glb > /tmp/orig.glb`, then point SRC at it). Re-running on an already-
 * tinted model is a safe no-op — the cognac is saturated (skipped) and the black
 * trim is dark (skipped) — but it will NOT re-derive the fabric, so start pristine.
 *
 * webp decode/encode needs a browser, so this uses puppeteer-core + system
 * Chrome alongside the gltf-transform + meshopt toolchain:
 *   npm i -D @gltf-transform/core @gltf-transform/extensions meshoptimizer puppeteer-core
 *   node scripts/recolor-seats.mjs
 * Writes public/neo3d/models/sealion6.glb, keeping meshopt compression.
 */
import puppeteer from 'puppeteer-core'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const MODEL = 'public/neo3d/models/sealion6.glb'
// Read from the pristine pre-tint texture (see header). Defaults to the committed
// model, which is a safe no-op; override to re-derive, e.g. SRC=/tmp/orig.glb.
const SRC = process.env.SRC || MODEL
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const doc = await io.read(SRC)
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
  // Cognac as a luminance-preserving recolour: a recoloured pixel keeps its own
  // brightness (so creases/shading survive) and takes the cognac hue.
  const COG = [170, 108, 58]
  const cl = 0.299 * COG[0] + 0.587 * COG[1] + 0.114 * COG[2]
  const V = [COG[0] / cl, COG[1] / cl, COG[2] / cl]
  // Below this luminance a pixel is the black bolster / seat-side / headrest trim
  // and is LEFT ALONE, so the seat keeps its real two-tone instead of going all
  // cognac. 55 cleanly splits the grey fabric panels from the dark trim (checked
  // against the atlas); the fabric panels sit well above it.
  const DARK_T = 55
  // Seat block of the atlas (in 512-space), scaled to the actual texture size.
  const sx = W / 512, sy = H / 512
  const BX1 = 265 * sx, BY0 = 256 * sy, BY1 = 508 * sy
  let n = 0
  for (let y = 0; y < H; y++) {
    if (y < BY0 || y > BY1) continue
    for (let xx = 0; xx <= BX1; xx++) {
      const i = (y * W + xx) * 4
      const r = px[i], g = px[i + 1], b = px[i + 2]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const sat = mx ? (mx - mn) / mx : 0
      if (sat > 0.45) continue // leave strongly-coloured pixels (logos, piping)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      if (lum < DARK_T) continue // black bolsters / sides / headrests stay black
      px[i] = Math.min(255, V[0] * lum); px[i + 1] = Math.min(255, V[1] * lum); px[i + 2] = Math.min(255, V[2] * lum); n++
    }
  }
  x.putImageData(d, 0, 0)
  return { webp: c.toDataURL('image/webp', 0.95).split(',')[1], n }
}, srcB64, mime)
await browser.close()
console.log(`recoloured ${out.n} seat fabric pixels (dark trim kept black)`)

tex.setImage(new Uint8Array(Buffer.from(out.webp, 'base64')))
tex.setMimeType('image/webp')
await io.write(MODEL, doc)
console.log('wrote', MODEL)
