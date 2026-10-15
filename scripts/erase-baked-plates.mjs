/*
 * One-off model surgery: erase the baked number-plate text from sealion6.glb.
 *
 * The SL6 GLB bakes both plates' text into vertex colours (material M_Trim_Black
 * has base colour white, so the colour is entirely vertex-driven). The front
 * plate lives on `body_mesh` prim 4; the rear plate lives on `tailgate_mesh`
 * prim 0 (it rides the tailgate). This recolours the dark text verts inside each
 * plate's face box to the plate's own white, leaving a clean blank plate that
 * the app overlays the live number onto (see 3d/model.js paintPlate).
 *
 * Boxes are in each mesh's LOCAL space (both meshes have identity rotation at
 * rest; tailgate_mesh is translated by +1.596 y / -1.585 z). They were found by
 * probing the model — re-probe if the model is ever re-exported.
 *
 * Run from the project root (needs the gltf-transform + meshopt toolchain):
 *   npm i -D @gltf-transform/core @gltf-transform/extensions meshoptimizer
 *   node scripts/erase-baked-plates.mjs
 * Writes public/neo3d/models/sealion6.glb in place (keeps meshopt compression).
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { statSync } from 'node:fs'

const MODEL = 'public/neo3d/models/sealion6.glb'

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const doc = await io.read(MODEL)
const meshNode = (name) => {
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh()
    if (m && m.getName() === name) return n
  }
  throw new Error('mesh not found: ' + name)
}

/** Recolour the dark (text) verts inside `box` to the plate's own sampled white. */
function erasePlate(meshName, primIdx, box) {
  const prim = meshNode(meshName).getMesh().listPrimitives()[primIdx]
  const pos = prim.getAttribute('POSITION')
  const col = prim.getAttribute('COLOR_0')
  const pe = [0, 0, 0]
  const el = [0, 0, 0, 0]
  const inBox = (p) =>
    p[0] >= box.xl && p[0] <= box.xh && p[1] >= box.yl && p[1] <= box.yh && p[2] >= box.zl && p[2] <= box.zh

  // Sample the plate's white from the bright verts in the box, so the filled
  // text matches the surrounding plate exactly.
  let wr = 0, wg = 0, wb = 0, wn = 0
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, pe)
    if (!inBox(pe)) continue
    col.getElement(i, el)
    if ((el[0] + el[1] + el[2]) / 3 > 0.6) { wr += el[0]; wg += el[1]; wb += el[2]; wn++ }
  }
  const W = wn ? [wr / wn, wg / wn, wb / wn] : [0.878, 0.878, 0.878]

  let changed = 0
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, pe)
    if (!inBox(pe)) continue
    col.getElement(i, el)
    if ((el[0] + el[1] + el[2]) / 3 < 0.5) { col.setElement(i, [W[0], W[1], W[2], 1]); changed++ }
  }
  console.log(`${meshName} prim ${primIdx}: white ${W.map((v) => +v.toFixed(3))}, recoloured ${changed} verts`)
}

erasePlate('body_mesh', 4, { xl: -0.25, xh: 0.25, yl: 0.53, yh: 0.66, zl: 2.385, zh: 2.40 })        // front
erasePlate('tailgate_mesh', 0, { xl: -0.30, xh: 0.30, yl: -0.83, yh: -0.62, zl: -0.765, zh: -0.74 }) // rear

await io.write(MODEL, doc)
console.log('wrote', MODEL, statSync(MODEL).size, 'bytes')
