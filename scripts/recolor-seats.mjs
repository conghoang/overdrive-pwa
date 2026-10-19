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
 *   - within a seat, a vertex blends toward black by how sideways it faces:
 *     smoothstep(0.60, 0.85, |normal.x|). A gradual band, not a hard flip —
 *     a binary cut stair-steps along the curved bolster/cushion edges (jagged
 *     dark notches), the feather smooths them. Headrest height (y > 1.33) and the
 *     seat back (normal.z < -0.3) are forced fully black; everything shallower
 *     than the band stays the CENTRE panel (cognac). Only the actual bolster
 *     goes black — not the shallow walls of the centre panel's sculpted channels.
 *   - every other vertex stays white (unchanged).
 * grey texel x cognac tint = cognac; grey texel x near-black tint = black; and
 * because vertex colours interpolate across each triangle the centre->trim
 * boundary is smooth. No texels are touched, so splotches are impossible, and it
 * covers front and rear identically.
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

// smoothstep: a GRADUAL bolster weight, not a hard flip. A binary side/centre
// cut stair-steps along the curved cushion/bolster edges (the jagged dark notches
// at the cushion fronts); blending cognac->black over a band of |nx| feathers
// those boundaries smooth. Headrest height and the seat back stay fully black.
const smoothstep = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x) }

const N = pos.getCount()
const p = [0, 0, 0], n = [0, 0, 0], c = [0, 0, 0, 1]
let seatVerts = 0
for (let i = 0; i < N; i++) {
  pos.getElement(i, p)
  col.getElement(i, c) // keep the existing alpha
  if (isSeat(p[0], p[1], p[2])) {
    nrm.getElement(i, n)
    let w = smoothstep(0.60, 0.85, Math.abs(n[0])) // bolster/side, feathered
    if (p[1] > 1.33 || n[2] < -0.3) w = 1 // headrest height / seat back: full black
    c[0] = COGNAC[0] * (1 - w) + BLACK[0] * w
    c[1] = COGNAC[1] * (1 - w) + BLACK[1] * w
    c[2] = COGNAC[2] * (1 - w) + BLACK[2] * w
    seatVerts++
  } else {
    c[0] = WHITE[0]; c[1] = WHITE[1]; c[2] = WHITE[2]
  }
  col.setElement(i, c)
}
console.log(`vertex-colour two-tone (feathered): ${seatVerts} seat vertices`)

await io.write(MODEL, doc)
console.log('wrote', MODEL)
