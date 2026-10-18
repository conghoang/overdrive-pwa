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
 * Inside the box we split fabric from trim by SPATIAL MAJORITY, then recolour
 * (the whole-block recolour this replaced browned the bolsters/headrests too; a
 * per-pixel luminance gate browned the lit bolster into mud, because the grey
 * fabric and the navy trim OVERLAP in both luminance and hue — the fabric is
 * itself cool/bluish — so no per-pixel rule separates them):
 *   - warm strongly-coloured pixels (piping/logos): left alone;
 *   - build a dark mask (luminance < DARK_T), BLUR it, and a pixel counts as
 *     TRIM where its neighbourhood is mostly dark — set solid black. A bolster
 *     (densely dark) stays black through its highlights; a fabric panel (densely
 *     light) recolours through its seams. Clean regions, no mud.
 *   - the rest (fabric panels): recoloured to the cognac hue, brightness kept.
 *
 * IMPORTANT: run this against the PRISTINE pre-tint texture (the model as of the
 * last commit before any seat recolour: `git show 5ce43f2:public/neo3d/models/
 * sealion6.glb > /tmp/orig.glb`, then point SRC at it). Re-running on a tinted
 * model would misclassify, so always start from the pristine texture.
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
  // Cognac as a luminance-preserving recolour: a recoloured pixel keeps its own
  // brightness (so creases/shading survive) and takes the cognac hue.
  const COG = [170, 108, 58]
  const cl = 0.299 * COG[0] + 0.587 * COG[1] + 0.114 * COG[2]
  const V = [COG[0] / cl, COG[1] / cl, COG[2] / cl]
  // Seat block of the atlas (in 512-space), scaled to the actual texture size.
  const sx = W / 512, sy = H / 512
  const BX1 = (265 * sx) | 0, BY0 = (256 * sy) | 0, BY1 = (508 * sy) | 0

  // Split fabric from black trim by SPATIAL MAJORITY, not per-pixel. The grey
  // fabric panels and the black navy bolsters/sides/headrests OVERLAP in both
  // luminance (lit navy reaches the fabric's range) and hue (the grey fabric is
  // itself cool/bluish), so no per-pixel threshold separates them cleanly — a
  // luminance gate browned the lit bolster into mud. Instead: build a dark mask
  // (lum < DARK_T), BLUR it, and treat a pixel as trim when its neighbourhood is
  // mostly dark. A bolster (densely dark) stays black through its highlights; a
  // fabric panel (densely light) recolours through its seams. Clean regions.
  const DARK_T = 65, BLUR = 6
  const src = x.getImageData(0, 0, W, H).data
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H
  const mx2 = mc.getContext('2d'); mx2.fillStyle = '#000'; mx2.fillRect(0, 0, W, H)
  const md = mx2.getImageData(0, 0, W, H), mp = md.data
  for (let y = BY0; y <= BY1; y++) for (let xx = 0; xx <= BX1; xx++) {
    const i = (y * W + xx) * 4
    if (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2] < DARK_T) { mp[i] = mp[i + 1] = mp[i + 2] = mp[i + 3] = 255 }
  }
  mx2.putImageData(md, 0, 0)
  const bc = document.createElement('canvas'); bc.width = W; bc.height = H
  const bx = bc.getContext('2d'); bx.filter = `blur(${BLUR}px)`; bx.drawImage(mc, 0, 0)
  const bd = bx.getImageData(0, 0, W, H).data

  const d = x.getImageData(0, 0, W, H)
  const px = d.data
  let n = 0
  for (let y = BY0; y <= BY1; y++) for (let xx = 0; xx <= BX1; xx++) {
    const i = (y * W + xx) * 4
    const r = px[i], g = px[i + 1], b = px[i + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const sat = mx ? (mx - mn) / mx : 0
    if (sat > 0.5 && r >= g && g >= b) continue // leave warm piping / logos
    if (bd[i] > 128) { px[i] = 16; px[i + 1] = 16; px[i + 2] = 18 } // trim region -> solid black
    else { const lum = 0.299 * r + 0.587 * g + 0.114 * b; px[i] = Math.min(255, V[0] * lum); px[i + 1] = Math.min(255, V[1] * lum); px[i + 2] = Math.min(255, V[2] * lum); n++ }
  }
  x.putImageData(d, 0, 0)
  return { webp: c.toDataURL('image/webp', 0.95).split(',')[1], n }
}, srcB64, mime)
await browser.close()
console.log(`recoloured ${out.n} seat fabric pixels (bolsters/sides/headrests set black)`)

tex.setImage(new Uint8Array(Buffer.from(out.webp, 'base64')))
tex.setMimeType('image/webp')
await io.write(MODEL, doc)
console.log('wrote', MODEL)
