/*
 * Seat two-tone via VERTEX COLOURS: cognac centre panels, black bolsters, sides
 * and headrests — on both rows.
 *
 * Earlier versions did this by editing the TEXTURE, and it never came out clean:
 * the front and rear seats share/mirror parts of the atlas, a centre panel and a
 * bolster can map to the same texels, and per-pixel colour rules (luminance, a
 * navy->black pass) left splotches in the middle of the seats and missed the
 * inner sides. Colour simply can't tell a bolster from a centre panel.
 *
 * GEOMETRY can. The interior mesh (M_Interior, prim 0) carries a COLOR_0 vertex
 * attribute, all white, and the material multiplies the (grey) texture by it. So
 * we leave the texture alone and TINT PER VERTEX from the geometry:
 *   - a vertex is a seat if it sits in the seat volume (seat height, cabin depth,
 *     either side of the centre console — the console and dash are excluded);
 *   - within a seat it is TRIM (black) when its surface faces sideways
 *     (|normal.x| > 0.4, i.e. a bolster/side), is up at headrest height
 *     (y > 1.33), or faces rearward (normal.z < -0.3, the seat back); otherwise
 *     it is the CENTRE panel (cognac);
 *   - every other vertex stays white (unchanged).
 * grey texel x cognac tint = cognac; grey texel x near-black tint = black; and
 * because vertex colours interpolate across each triangle the centre->trim
 * boundary is smooth, never a jagged cut. No texels are touched, so splotches are
 * impossible, and it covers front and rear identically.
 *
 * Idempotent: re-running just re-derives the same per-vertex colours. Runs on the
 * pristine model by default; the committed model works too (its texture is the
 * original grey — only COLOR_0 differs).
 *   node scripts/recolor-seats.mjs
 * Writes public/neo3d/models/sealion6.glb, keeping meshopt compression.
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const MODEL = 'public/neo3d/models/sealion6.glb'
const SRC = process.env.SRC || MODEL

// Linear vertex tints (multiplied with the grey fabric texture).
const COGNAC = [1.0, 0.56, 0.29]
const BLACK = [0.07, 0.07, 0.08]
const WHITE = [1, 1, 1]

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const doc = await io.read(SRC)
const prim = doc.getRoot().listNodes().find((n) => n.getName() === 'interior').getMesh().listPrimitives()[0]
const pos = prim.getAttribute('POSITION')
const nrm = prim.getAttribute('NORMAL')
const col = prim.getAttribute('COLOR_0')
if (!col) throw new Error('interior primitive has no COLOR_0 vertex attribute')

// Seat volume: seat height, cabin depth, either side of the centre console. The
// front console (front, centred) is carved out; the dash sits ahead of z<0.9.
const isSeat = (x, y, z) =>
  y > 0.40 && y < 1.63 && z > -1.72 && z < 0.9 && Math.abs(x) < 0.82 && !(z > -0.5 && Math.abs(x) < 0.12)

const N = pos.getCount()
const p = [0, 0, 0], n = [0, 0, 0], c = [0, 0, 0, 1]
let cognac = 0, trim = 0
for (let i = 0; i < N; i++) {
  pos.getElement(i, p)
  col.getElement(i, c) // keep the existing alpha
  let tint = WHITE
  if (isSeat(p[0], p[1], p[2])) {
    nrm.getElement(i, n)
    const isTrim = Math.abs(n[0]) > 0.40 || p[1] > 1.33 || n[2] < -0.3
    if (isTrim) { tint = BLACK; trim++ } else { tint = COGNAC; cognac++ }
  }
  c[0] = tint[0]; c[1] = tint[1]; c[2] = tint[2]
  col.setElement(i, c)
}
console.log(`vertex-colour two-tone: ${cognac} cognac + ${trim} trim vertices`)

await io.write(MODEL, doc)
console.log('wrote', MODEL)
