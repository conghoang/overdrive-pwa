/*
 * Seat colours to match the real BYD Sealion 6 "black + brown" cabin (reference:
 * the factory interior shot — cognac perforated centre panels, BLACK side
 * bolsters and headrests, with an ORANGE piping line along every cognac/black
 * seam). Done with VERTEX COLOURS, not texture edits: the texture is left alone,
 * so splotches are impossible and both rows are covered identically.
 *
 * Two primitives make up the interior and BOTH must be coloured:
 *   - prim0  M_Interior         textured grey fabric, carries COLOR_0. The seat
 *                               backrests + the centre of the cushions. Its colour
 *                               is texture(grey) x COLOR_0, so a cognac tint lands
 *                               as cognac with the fabric detail intact.
 *   - prim1  M_Interior_Accent  FLAT, no texture, ships dark (~0.02) by design:
 *                               the bolster sides, the seat-side valance, the
 *                               centre console and footwell trim — and, crucially,
 *                               most of the cushion SEATING SURFACE. Left untouched
 *                               it renders the cushions near-black (the old bug:
 *                               grey cushions) and the inboard seat-side as a dark
 *                               wedge. We tint ONLY the upward-facing cushion top
 *                               cognac; everything else in prim1 stays its original
 *                               dark — which is correct, the real car's bolsters,
 *                               inboard side and console are all black too.
 *
 * Trim rule (prim0): blend cognac->black by how sideways a vertex faces,
 * smoothstep(0.60,0.85,|nx|) — a feathered band, not a hard flip (a binary cut
 * stair-steps the curved bolster edges). Headrest height (y>1.33) and the seat
 * back (nz<-0.3) are forced fully black. A thin ORANGE piping line is painted
 * where that band crosses the seam (0.30<w<0.72), but never on the headrest or
 * the seat back (those are solid black on the real car).
 *
 * Idempotent; runs on the pristine or the committed model (texture is unchanged).
 *   node scripts/recolor-seats.mjs
 * Writes public/neo3d/models/sealion6.glb, keeping meshopt compression.
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const MODEL = 'public/neo3d/models/sealion6.glb'
const SRC = process.env.SRC || MODEL

// prim0 is textured (tint x grey fabric); prim1 is flat, so it needs a muted
// cognac to match prim0's rendered (textured) cognac rather than glow brighter.
const COGNAC = [1.0, 0.56, 0.29]
const COGNAC_FLAT = [0.60, 0.34, 0.17]
const BLACK = [0.07, 0.07, 0.08]
const ORANGE = [1.0, 0.30, 0.03]
const WHITE = [1, 1, 1]

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const doc = await io.read(SRC)
const prims = doc.getRoot().listNodes().find((n) => n.getName() === 'interior').getMesh().listPrimitives()

// Seat volume: seat height, cabin depth, either side of the centre console. The
// front console (front, centred) is carved out; the dash sits ahead of z<0.9.
const isSeat = (x, y, z) =>
  y > 0.40 && y < 1.63 && z > -1.72 && z < 0.9 && Math.abs(x) < 0.82 && !(z > -0.5 && Math.abs(x) < 0.12)
const smoothstep = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x) }

// prim0 — backrests + cushion centres: cognac/black two-tone + orange piping.
{
  const prim = prims[0]
  const pos = prim.getAttribute('POSITION'), nrm = prim.getAttribute('NORMAL'), col = prim.getAttribute('COLOR_0')
  if (!col) throw new Error('prim0 has no COLOR_0 vertex attribute')
  const N = pos.getCount()
  const p = [0, 0, 0], n = [0, 0, 0], c = [0, 0, 0, 1]
  let seat = 0, pipe = 0
  for (let i = 0; i < N; i++) {
    pos.getElement(i, p)
    col.getElement(i, c) // keep existing alpha
    if (isSeat(p[0], p[1], p[2])) {
      nrm.getElement(i, n)
      const body = p[1] <= 1.33 && n[2] >= -0.3 // not headrest, not seat-back rear
      let w = smoothstep(0.60, 0.85, Math.abs(n[0]))
      const onSeam = body && w > 0.30 && w < 0.72
      if (!body) w = 1
      if (onSeam) { c[0] = ORANGE[0]; c[1] = ORANGE[1]; c[2] = ORANGE[2]; pipe++ }
      else {
        c[0] = COGNAC[0] * (1 - w) + BLACK[0] * w
        c[1] = COGNAC[1] * (1 - w) + BLACK[1] * w
        c[2] = COGNAC[2] * (1 - w) + BLACK[2] * w
      }
      seat++
    } else { c[0] = WHITE[0]; c[1] = WHITE[1]; c[2] = WHITE[2] }
    col.setElement(i, c)
  }
  console.log(`prim0: ${seat} seat verts (${pipe} piping)`)
}

// prim1 — tint only the upward-facing cushion seating surface cognac. Bolsters,
// the inboard seat-side, the centre console and footwell trim keep their original
// dark (that matches the real car). |x|>0.20 keeps the central console/footwell
// out; ny>0.45 keeps it to the horizontal cushion top, not the vertical sides.
{
  const prim = prims[1]
  const pos = prim.getAttribute('POSITION'), nrm = prim.getAttribute('NORMAL'), col = prim.getAttribute('COLOR_0')
  if (!col) throw new Error('prim1 has no COLOR_0 vertex attribute')
  const N = pos.getCount()
  const p = [0, 0, 0], n = [0, 0, 0], c = [0, 0, 0, 1]
  let cushion = 0
  for (let i = 0; i < N; i++) {
    pos.getElement(i, p); nrm.getElement(i, n); col.getElement(i, c)
    if (isSeat(p[0], p[1], p[2]) && Math.abs(p[0]) > 0.20 && n[1] > 0.45 && p[1] < 0.95) {
      c[0] = COGNAC_FLAT[0]; c[1] = COGNAC_FLAT[1]; c[2] = COGNAC_FLAT[2]; cushion++
    } // else: leave the original dark vertex colour untouched
    col.setElement(i, c)
  }
  console.log(`prim1: ${cushion} cushion-top verts tinted cognac`)
}

await io.write(MODEL, doc)
console.log('wrote', MODEL)
