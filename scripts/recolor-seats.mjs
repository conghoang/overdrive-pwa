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

// Side-facing seat surfaces (the bolsters/sides, inner AND outer) are the SAME
// light colour as the centre panel in the texture — only their geometry differs
// — so no colour rule finds them. Collect the front-seat triangles whose normal
// faces sideways (|nx| > SIDE_NX; the interior node has an identity transform, so
// local nx == world nx) and rasterise them into the black mask in the browser.
const SIDE_NX = 0.4
const prim = doc.getRoot().listNodes().find((n) => n.getName() === 'interior').getMesh().listPrimitives()[0]
const uvA = prim.getAttribute('TEXCOORD_0'), nmA = prim.getAttribute('NORMAL'), ix = prim.getIndices()
const sideTris = []
{
  const ua = [0, 0], ub = [0, 0], uc = [0, 0], na = [0, 0, 0], nb = [0, 0, 0], nc = [0, 0, 0]
  const nI = ix ? ix.getCount() : uvA.getCount(), gi = (k) => (ix ? ix.getScalar(k) : k)
  for (let i = 0; i < nI; i += 3) {
    const i0 = gi(i), i1 = gi(i + 1), i2 = gi(i + 2)
    uvA.getElement(i0, ua); uvA.getElement(i1, ub); uvA.getElement(i2, uc)
    const cu = (ua[0] + ub[0] + uc[0]) / 3, cv = (ua[1] + ub[1] + uc[1]) / 3
    if (!(cu < 0.52 && cv < 0.5)) continue // front-seat atlas block
    nmA.getElement(i0, na); nmA.getElement(i1, nb); nmA.getElement(i2, nc)
    if (Math.abs((na[0] + nb[0] + nc[0]) / 3) > SIDE_NX) sideTris.push([ua.slice(), ub.slice(), uc.slice()])
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
const out = await page.evaluate(async (b64, mime, sideTris) => {
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

  // Build the black (trim) mask two ways, then feather it. The grey fabric and
  // the navy trim OVERLAP in luminance and hue, and the SIDE bolsters are the
  // same light colour as the centre panel, so neither colour nor a per-pixel
  // threshold separates them. So the mask = (A) dark pixels (lum < DARK_T: the
  // navy bolsters/headrests) UNION (B) the side-facing triangles from sideTris
  // (the light inner/outer bolsters). BLUR it to a density field and BLEND cognac
  // -> black by that density, so each region takes its neighbourhood's class
  // through its highlights/seams and the boundary is feathered, not a jagged cut.
  const DARK_T = 70, BLUR = 3
  const src = x.getImageData(0, 0, W, H).data
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H
  const mx2 = mc.getContext('2d'); mx2.fillStyle = '#000'; mx2.fillRect(0, 0, W, H)
  const md = mx2.getImageData(0, 0, W, H), mp = md.data
  for (let y = BY0; y <= BY1; y++) for (let xx = 0; xx <= BX1; xx++) {
    const i = (y * W + xx) * 4
    if (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2] < DARK_T) { mp[i] = mp[i + 1] = mp[i + 2] = mp[i + 3] = 255 }
  }
  mx2.putImageData(md, 0, 0)
  // (B) paint the side-facing seat triangles white (UV v is flipped vs image Y)
  mx2.fillStyle = '#fff'; mx2.strokeStyle = '#fff'; mx2.lineWidth = 2; mx2.lineJoin = 'round'
  for (const t of sideTris) {
    mx2.beginPath()
    mx2.moveTo(t[0][0] * W, (1 - t[0][1]) * H)
    mx2.lineTo(t[1][0] * W, (1 - t[1][1]) * H)
    mx2.lineTo(t[2][0] * W, (1 - t[2][1]) * H)
    mx2.closePath(); mx2.fill(); mx2.stroke()
  }
  const bc = document.createElement('canvas'); bc.width = W; bc.height = H
  const bx = bc.getContext('2d'); bx.filter = `blur(${BLUR}px)`; bx.drawImage(mc, 0, 0)
  const bd = bx.getImageData(0, 0, W, H).data

  const BK = [16, 16, 18] // trim black
  const d = x.getImageData(0, 0, W, H)
  const px = d.data
  let n = 0
  for (let y = BY0; y <= BY1; y++) for (let xx = 0; xx <= BX1; xx++) {
    const i = (y * W + xx) * 4
    const r = px[i], g = px[i + 1], b = px[i + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const sat = mx ? (mx - mn) / mx : 0
    if (sat > 0.5 && r >= g && g >= b) continue // leave warm piping / logos
    // density of dark neighbourhood in [0,1], remapped to a tight-but-feathered
    // transition band so panels stay crisp while the boundary isn't a jagged cut.
    let a = Math.min(1, Math.max(0, (bd[i] / 255 - 0.35) / 0.3))
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const cr = Math.min(255, V[0] * lum), cg = Math.min(255, V[1] * lum), cb = Math.min(255, V[2] * lum)
    px[i] = cr * (1 - a) + BK[0] * a
    px[i + 1] = cg * (1 - a) + BK[1] * a
    px[i + 2] = cb * (1 - a) + BK[2] * a
    if (a < 0.5) n++
  }

  // Second pass, WHOLE texture: the REAR seats map to their own atlas region the
  // front-seat box never touched — their centres share the front's cognac UV, but
  // their headrests/sides are a separate NAVY trim. Set the remaining dark navy
  // (bluish and not bright) to solid black so the rear matches the front. Cognac
  // is warm (r>b) and the trim black is neutral, so neither is affected; the blue
  // screens are bright (lum excluded) so they're left alone.
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2]
    if (b - r >= 6 && b >= g - 2 && (0.299 * r + 0.587 * g + 0.114 * b) < 120) { px[i] = BK[0]; px[i + 1] = BK[1]; px[i + 2] = BK[2] }
  }
  x.putImageData(d, 0, 0)
  return { webp: c.toDataURL('image/webp', 0.95).split(',')[1], n }
}, srcB64, mime, sideTris)
await browser.close()
console.log(`recoloured ${out.n} seat fabric pixels (bolsters/sides/headrests blended to black)`)

tex.setImage(new Uint8Array(Buffer.from(out.webp, 'base64')))
tex.setMimeType('image/webp')
await io.write(MODEL, doc)
console.log('wrote', MODEL)
