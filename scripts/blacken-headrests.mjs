/*
 * Follow-up to recolor-seats.mjs: paint the FRONT seat headrests black.
 *
 * The cognac recolour browned a block of the shared interior atlas that covers
 * the front seats — and the front headrests live on their own small UV island
 * inside that block, so they got the cognac tint too. The rear seats (and their
 * black headrests) sit elsewhere in the atlas and stayed black, so the front
 * headrests ended up mismatched (cognac) against the black rear ones.
 *
 * The headrests aren't separate objects: the front seat + its headrest share one
 * material (M_Interior) and one texture, so this can only be fixed in the texture.
 * We find the exact headrest texels from the GEOMETRY rather than guessing at the
 * atlas: take prim0 (M_Interior) triangles whose centroid is high on the seat
 * (Y > 1.3, i.e. the headrest/upper backrest) AND whose UV is in the recoloured
 * front-seat block (u < 0.52, v < 0.5), then rasterise those triangles' UVs into
 * the texture and fill them near-black (a 3px round stroke closes UV seams). Both
 * front seats share the island, so both headrests go black in one pass.
 *
 * Run AFTER recolor-seats.mjs (re-running that would re-brown these texels).
 *   npm i -D @gltf-transform/core @gltf-transform/extensions meshoptimizer puppeteer-core
 *   node scripts/blacken-headrests.mjs
 * Writes public/neo3d/models/sealion6.glb in place, keeping meshopt compression.
 * Re-running is safe (the texels are already black).
 */
import puppeteer from 'puppeteer-core'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const MODEL = 'public/neo3d/models/sealion6.glb'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const Y_MIN = 1.3 // headrest/upper-backrest height (seat spans ~0.4–1.58)
const BLACK = 'rgb(20,20,22)' // near-black, matching the dark interior trim

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const doc = await io.read(MODEL)
const root = doc.getRoot()
const prim = root.listNodes().find((n) => n.getName() === 'interior').getMesh().listPrimitives()[0]
const pos = prim.getAttribute('POSITION')
const uv = prim.getAttribute('TEXCOORD_0')
const idx = prim.getIndices()

// Collect the UV triangles of the front headrests.
const tris = []
const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0]
const ua = [0, 0], ub = [0, 0], uc = [0, 0]
const nI = idx ? idx.getCount() : pos.getCount()
const gi = (i) => (idx ? idx.getScalar(i) : i)
for (let i = 0; i < nI; i += 3) {
  const i0 = gi(i), i1 = gi(i + 1), i2 = gi(i + 2)
  pos.getElement(i0, a); pos.getElement(i1, b); pos.getElement(i2, c)
  uv.getElement(i0, ua); uv.getElement(i1, ub); uv.getElement(i2, uc)
  const cy = (a[1] + b[1] + c[1]) / 3
  const cu = (ua[0] + ub[0] + uc[0]) / 3
  const cv = (ua[1] + ub[1] + uc[1]) / 3
  if (cy > Y_MIN && cu < 0.52 && cv < 0.5) tris.push([ua.slice(), ub.slice(), uc.slice()])
}

const tex = root.listTextures().find((t) => t.getName() === 'interior')
const srcB64 = Buffer.from(tex.getImage()).toString('base64')
const mime = tex.getMimeType()

// webp decode/encode needs a browser.
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
const webp = await page.evaluate(async (b64, mime, tris, BLACK) => {
  const img = new Image()
  img.src = `data:${mime};base64,${b64}`
  await img.decode()
  const W = img.width, H = img.height
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const x = c.getContext('2d')
  x.drawImage(img, 0, 0)
  x.fillStyle = BLACK; x.strokeStyle = BLACK; x.lineWidth = 3; x.lineJoin = 'round'
  for (const t of tris) {
    x.beginPath()
    x.moveTo(t[0][0] * W, (1 - t[0][1]) * H) // UV v is flipped vs image Y
    x.lineTo(t[1][0] * W, (1 - t[1][1]) * H)
    x.lineTo(t[2][0] * W, (1 - t[2][1]) * H)
    x.closePath()
    x.fill(); x.stroke()
  }
  return c.toDataURL('image/webp', 0.95).split(',')[1]
}, srcB64, mime, tris, BLACK)
await browser.close()
console.log(`blackened ${tris.length} front-headrest triangles`)

tex.setImage(new Uint8Array(Buffer.from(webp, 'base64')))
tex.setMimeType('image/webp')
await io.write(MODEL, doc)
console.log('wrote', MODEL)
