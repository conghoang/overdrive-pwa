/*
 * phone/3d/model.js: the owner's Sealion 6 model (rev06) made ready for the phone hero (UI_PLAN 3.3-3.5, 4.3-4.5;
 * step S6b). Port of the QA-verified runtime profile E:\OverDrive\3d\qa\runtime_profile.js (QA_RESULTS.json):
 * it changes GPU state only, never a node name, the hierarchy or extras.od.
 *
 * - Nodes are indexed by exact name; every mover (extras.od kind hinge | slide | spin) keeps its rest transform.
 *   The mirrors are attached to their door (extras.mountParent) before the rest pose is stored (REVISION_NOTES rule 2).
 * - Every lamp, screen and LED mesh gets its own material clone; its authored emissive strength is its ON level, and
 *   everything starts OFF (UI_PLAN 3.4 step 3).
 * - Depth ties: M_Paint and M_Chrome draw front faces plus a pushed-back back-face twin (same geometry, no culling
 *   holes); polygonOffset ranks for trim, interior, calipers and emitters; glass and lenses in one transparent pass.
 * - Optional legibility aid: one soft additive sprite per front/turn/reverse/charge emitter, faded by the angle to
 *   the camera, hidden while the lamp is off (no bloom pass).
 * - Anchors for the HTML badges (door handles, tailgate, charge port) live in their part's local frame, so a badge
 *   follows an opening door.
 */
import * as THREE from '../vendor/three/three.module.min.js';

// polygonOffset (factor, units): negative pulls toward the camera, positive pushes back.
const RANK = { M_Trim_Black: [1, 2], M_Caliper: [1, 2], M_Interior: [2, 4], M_Interior_Accent: [2, 4] };
const EMITTER_RANK = [-1, -2];
const TWIN = new Set(['M_Paint', 'M_Chrome']);
const TWIN_BACK_RANK = [2, 4];
const MOVER_KINDS = new Set(['hinge', 'slide', 'spin']);

const isEmitter = (m) => !!m.emissiveMap || (!!m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0);

/** Lamp group of a node name (QA lampGroup), or null. */
export function lampGroup(name) {
  if (name === 'led_charge') return 'charge';
  if (name.startsWith('screen_')) return 'screens';
  if (/^lamp_low_/.test(name)) return 'low';
  if (/^lamp_high_/.test(name)) return 'high';
  if (/^lamp_drl_/.test(name)) return 'drl';
  if (/^lamp_turn_(FL|mirror_L|RL)(_|$)/.test(name)) return 'turnL';
  if (/^lamp_turn_(FR|mirror_R|RR)(_|$)/.test(name)) return 'turnR';
  if (/^lamp_tail_/.test(name)) return 'tail';
  if (/^lamp_brake_/.test(name)) return 'brake';
  if (/^lamp_reverse_/.test(name)) return 'reverse';
  return null;
}
/** Left side of a front light surface: lamp_drl_L, lamp_turn_FL ("endsWith('_L')" alone misses FL, QA note). */
export const isLeftFront = (name) => /(_L|FL)$/.test(name);

/** QA applyPhoneMaterialProfile: twins for paint and chrome, depth ranks, single-pass transparency. */
function applyMaterialProfile(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.odTwin) meshes.push(o); });
  const backMaterials = new Map();
  for (const mesh of meshes) {
    for (const m of [].concat(mesh.material)) {
      if (m.transparent) {
        m.forceSinglePass = true;
        m.depthWrite = false;
        mesh.renderOrder = /Lens/.test(m.name) ? 1 : 2;
        continue;
      }
      const r = isEmitter(m) ? EMITTER_RANK : RANK[m.name];
      if (r) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = r[0];
        m.polygonOffsetUnits = r[1];
      }
    }
    const m = mesh.material;
    if (!Array.isArray(m) && TWIN.has(m.name) && m.side === THREE.DoubleSide) {
      let back = backMaterials.get(m);
      if (!back) {
        back = m.clone();
        back.side = THREE.BackSide;
        back.polygonOffset = true;
        back.polygonOffsetFactor = TWIN_BACK_RANK[0];
        back.polygonOffsetUnits = TWIN_BACK_RANK[1];
        back.name = m.name;
        backMaterials.set(m, back);
      }
      const twin = new THREE.Mesh(mesh.geometry, back);
      twin.name = `${mesh.name}__back`;
      twin.userData.odTwin = true;
      twin.raycast = () => {};
      twin.morphTargetInfluences = mesh.morphTargetInfluences;
      twin.morphTargetDictionary = mesh.morphTargetDictionary;
      mesh.add(twin);
    }
  }
  for (const m of new Set(meshes.flatMap((o) => [].concat(o.material)))) {
    if (TWIN.has(m.name) && m.side === THREE.DoubleSide) m.side = THREE.FrontSide;
  }
  for (const m of backMaterials.values()) m.needsUpdate = true;
}

// ---------------------------------------------------------------- lamp glow (QA createLampGlow / updateLampGlow)
/*
 * Sized for the hero, not for the lens (owner 2026-10-11, QA "front lamps and rear turn hard to read at Home size"):
 * the emitters are small (low beam 9 x 2 cm, a rear turn segment 11 x 1 cm, about 1 CSS px tall on Home), and on
 * Aurora White an additive glow only shows where it leaves the paint. So:
 * - low / high / DRL: a larger additive glow with a hot core (it reads on the dark lamp housing, the grille and the
 *   background past the car's edge); no ground "light pool" (UI_PLAN 3.5 optional: tried, it read as a smudge
 *   apart from the nose at hero size);
 * - turn signals (front, mirror repeater, each rear segment): an amber glow drawn over the scene (normal blending)
 *   with a warm-white core, so the amber also reads on the white paint; one sprite per segment keeps the 30 ms
 *   sequence; their emissive strength is lowered (TURN_GAIN) so Neutral tone mapping keeps the lens amber instead
 *   of peach-white;
 * - reverse and the charge LED keep the QA values; tail and brake have no glow (QA: their red already reads, a
 *   sprite on a 0.8 m bar is a blob).
 * Sizes in metres: clamp(emitter diagonal x k, min, max); a: opacity at full level.
 */
const GLOW = {
  low: { color: 0xdfe9ff, k: 1.6, min: 0.28, max: 0.36, a: 1 },
  high: { color: 0xeaf2ff, k: 1.6, min: 0.32, max: 0.42, a: 1 },
  drl: { color: 0xf2f6ff, k: 1.2, min: 0.28, max: 0.36, a: 1 },
  reverse: { color: 0xf2f6ff, k: 0.9, min: 0.10, max: 0.42, a: 0.9 },
  charge: { color: 0x30ff70, k: 0.9, min: 0.10, max: 0.42, a: 0.9 },
  turnFront: { amber: true, k: 1.3, min: 0.34, max: 0.42, a: 0.95 },
  turnMirror: { amber: true, k: 1.3, min: 0.26, max: 0.30, a: 0.95 },
  turnRear: { amber: true, k: 1.6, min: 0.22, max: 0.24, a: 0.95 }
};
/** Turn lamps: emissive strength x this (authored 4 -> 2.2): amber under Neutral tone mapping 0.9. */
export const TURN_GAIN = 0.55;
const GLOW_OFFSET = 0.06;
let glowTexture = null;
let lampTexture = null;
let amberTexture = null;
function radial(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, col] of stops) g.addColorStop(at, col);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** The shared soft dot (A/C airflow, reverse and charge glows); disposed with the car. */
export function dotTexture() {
  if (!glowTexture) glowTexture = radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
  return glowTexture;
}
/** Front white lamps: a hot core and a long soft tail (a bloom look without a bloom pass). */
function lampDot() {
  if (!lampTexture) {
    lampTexture = radial([[0, 'rgba(255,255,255,1)'], [0.1, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,255,255,0.42)'],
      [0.6, 'rgba(255,255,255,0.1)'], [1, 'rgba(255,255,255,0)']]);
  }
  return lampTexture;
}
/** Turn signals: warm-white core, amber ring, amber falloff (the colour lives in the texture). */
function amberDot() {
  if (!amberTexture) {
    amberTexture = radial([[0, 'rgba(255,240,205,1)'], [0.12, 'rgba(255,184,72,0.96)'], [0.32, 'rgba(255,138,18,0.62)'],
      [0.62, 'rgba(255,122,10,0.2)'], [1, 'rgba(255,118,8,0)']]);
  }
  return amberTexture;
}
/** The glow kind of a lamp: its group, the turn signals split by place. */
function glowKind(name, group) {
  if (group !== 'turnL' && group !== 'turnR') return group;
  if (/mirror/.test(name)) return 'turnMirror';
  return /^lamp_turn_R[LR]/.test(name) ? 'turnRear' : 'turnFront';
}
function createGlow(mesh, group, name) {
  const cfg = GLOW[glowKind(name, group)];
  if (!cfg) return null;
  const g = mesh.geometry;
  g.computeBoundingBox();
  const ctr = g.boundingBox.getCenter(new THREE.Vector3());
  const size = g.boundingBox.getSize(new THREE.Vector3());
  const n = new THREE.Vector3();
  const nor = g.attributes.normal;
  const tmp = new THREE.Vector3();
  if (nor) for (let i = 0; i < nor.count; i++) n.add(tmp.fromBufferAttribute(nor, i));
  n.normalize();
  // led_charge normals face inward (rev05, unchanged in rev06): use the car side instead.
  if (group === 'charge') n.set(Math.sign(ctr.x) || -1, 0, 0);
  const front = group === 'low' || group === 'high' || group === 'drl';
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial(cfg.amber
    ? { map: amberDot(), color: 0xffffff, blending: THREE.NormalBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }
    : { map: front ? lampDot() : dotTexture(), color: cfg.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
  const r = THREE.MathUtils.clamp(size.length() * cfg.k, cfg.min, cfg.max);
  sprite.scale.set(r, r, 1);
  // A larger sprite sits a little further out, so the body around the lamp does not cut its halo.
  sprite.position.copy(ctr).addScaledVector(n, Math.max(GLOW_OFFSET, r * 0.25));
  sprite.renderOrder = 5;
  sprite.visible = false;
  sprite.userData.odGlowNormal = n;
  sprite.userData.odGlowA = cfg.a;
  sprite.raycast = () => {};
  mesh.add(sprite);
  return sprite;
}
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
/** level 0..1 (already blink-shaped); after updateMatrixWorld. */
export function updateGlow(sprite, level, camera) {
  if (!sprite) return;
  if (!(level > 0.001) || !sprite.parent.visible) { sprite.visible = false; return; }
  _n.copy(sprite.userData.odGlowNormal).transformDirection(sprite.parent.matrixWorld);
  sprite.getWorldPosition(_p);
  const facing = THREE.MathUtils.smoothstep(_n.dot(_p.sub(camera.position).negate().normalize()), 0.05, 0.45);
  sprite.visible = facing > 0.001;
  sprite.material.opacity = Math.min(1, level) * facing * sprite.userData.odGlowA;
}

// ---------------------------------------------------------------- the car
/**
 * Prepare a loaded glTF scene: index, movers, lamps (OFF), material profile, glows, anchors.
 * Returns the model handle used by mapping.js and car3d.js.
 */
export function prepareCar(root) {
  const nodes = new Map();
  root.traverse((o) => { if (o.name && !nodes.has(o.name)) nodes.set(o.name, o); });
  root.updateMatrixWorld(true);

  // Movers; mirrors follow their door (attach keeps the world transform), then the rest pose is stored.
  const movers = new Map();
  root.traverse((o) => {
    const od = o.userData && o.userData.od;
    if (od && MOVER_KINDS.has(od.kind)) movers.set(o.name, { node: o, od });
  });
  for (const e of movers.values()) {
    const mp = e.node.userData.mountParent;
    if (mp && nodes.has(mp)) nodes.get(mp).attach(e.node);
  }
  for (const e of movers.values()) {
    e.restPos = e.node.position.clone();
    e.restQuat = e.node.quaternion.clone();
    if (e.od.kind === 'hinge' || e.od.kind === 'spin') e.axis = new THREE.Vector3().fromArray(e.od.axis).normalize();
    if (e.od.kind === 'slide') e.dir = new THREE.Vector3().fromArray(e.od.dir).normalize();
    // The sunshade retracts with a morph while it slides (REVISION_NOTES rule 1).
    e.morphs = [];
    if (e.od.morph) {
      e.node.traverse((n) => {
        const dict = n.morphTargetDictionary;
        if (n.morphTargetInfluences && !n.userData.odTwin) {
          const i = dict && dict[e.od.morph] !== undefined ? dict[e.od.morph] : 0;
          e.morphs.push({ mesh: n, i });
        }
      });
    }
  }

  // Lamps: a material per mesh, authored strength = ON level, OFF to start.
  const lamps = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.odTwin) return;
    let src = null;
    let group = null;
    for (let a = o; a && !group; a = a.parent) {
      group = lampGroup(a.name || '');
      if (group) src = a.name;
    }
    if (!group) return;
    o.material = o.material.clone();
    let ex = null;
    for (let b = o; b && !ex; b = b.parent) ex = b.userData.lightSurface ? b.userData.lightSurface : null;
    const seg = /_(\d+)$/.exec(src);
    const turn = group === 'turnL' || group === 'turnR';
    lamps.push({
      mesh: o, name: src, group, mat: o.material, on: (o.material.emissiveIntensity || 1) * (turn ? TURN_GAIN : 1),
      seg: seg ? Math.max(0, Number(seg[1]) - 1) : 0, exclusive: ex, left: isLeftFront(src), level: 0, glow: null,
      baseEmissive: o.material.emissive.clone()
    });
  });

  applyMaterialProfile(root);
  const bounds = new THREE.Box3().setFromObject(root, true);    // before the glow sprites exist
  // Part centres at rest (precise boxes), where the director aims the camera: every mover and the charge LED, taken
  // before the glow sprites exist.
  const centers = {};
  for (const name of Array.from(movers.keys()).concat('led_charge')) {
    const n = nodes.get(name);
    if (n) centers[name] = new THREE.Box3().setFromObject(n, true).getCenter(new THREE.Vector3());
  }
  for (const L of lamps) {
    L.mat.emissiveIntensity = 0;
    L.glow = createGlow(L.mesh, L.group, L.name);
  }

  // Aurora White paint (UI_PLAN 3.3, 4.5): clearcoat paint, colour from meta.color at runtime.
  const paint = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && m.name === 'M_Paint' && paint.indexOf(m) < 0) paint.push(m);
  });
  for (const m of paint) {
    if ('clearcoat' in m) {
      m.clearcoat = 1;
      m.clearcoatRoughness = 0.04;
    }
    m.roughness = 0.35;
    m.metalness = 0.05;
  }


  // Badge anchors in their part's frame (rest pose): door handles, tailgate, charge port.
  root.updateMatrixWorld(true);
  const anchors = {};
  const box = new THREE.Box3();
  const local = (node, p) => node.worldToLocal(p.clone());
  // The part's own meshes: not its glass, a mirror riding on it, or a glow sprite.
  const part = new THREE.Box3();
  const ownBox = (node) => {
    box.makeEmpty();
    const walk = (o) => {
      if (o !== node && (o.userData.od || o.isSprite || o.userData.odTwin)) return;
      if (o.isMesh && o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
      }
      o.children.forEach(walk);
    };
    walk(node);
    return box;
  };
  for (const id of ['FL', 'FR', 'RL', 'RR']) {
    const door = nodes.get(`door_${id}`);
    if (!door) continue;
    ownBox(door);
    const left = id.endsWith('L');
    const size = box.getSize(new THREE.Vector3());
    const p = new THREE.Vector3(left ? box.max.x : box.min.x, box.min.y + size.y * 0.62, box.min.z + size.z * 0.22);
    anchors[`door_${id}`] = { node: door, local: local(door, p), normal: new THREE.Vector3(left ? 1 : -1, 0, 0), normalLocal: true };
  }
  const tail = nodes.get('tailgate');
  if (tail) {
    ownBox(tail);
    const p = new THREE.Vector3(0, box.min.y + (box.max.y - box.min.y) * 0.45, box.min.z);
    anchors.tailgate = { node: tail, local: local(tail, p), normal: new THREE.Vector3(0, 0, -1), normalLocal: true };
  }
  const led = nodes.get('led_charge');
  if (led) {
    ownBox(led);
    const ctr = box.getCenter(new THREE.Vector3());
    anchors.charge = { node: root, local: local(root, ctr), normal: new THREE.Vector3(Math.sign(ctr.x) || -1, 0, 0), normalLocal: false };
  }

  return { root, nodes, movers, lamps, paint, anchors, bounds, centers };
}

/** Paint tint (meta.color): every M_Paint material, front and back twins. */
export function setPaint(car, css) {
  const color = /^#[0-9a-fA-F]{6}$/.test(css || '') ? css : '#E8E8EC';
  car.root.traverse((o) => {
    if (o.isMesh && o.material && o.material.name === 'M_Paint') o.material.color.set(color);
  });
}

/*
 * Custom number plates. The model's baked plate text is erased (see
 * scripts/erase-baked-plates.mjs), so these thin textured quads just carry the
 * live number over each blank plate, 2 mm proud of the face. The front plate is
 * on the bumper (car-root space). The rear plate RIDES THE TAILGATE, so it's
 * parented to the tailgate node in that node's local space (y/z shifted by the
 * node's rest offset 0, +1.596, -1.585) and swings up with the tailgate when it
 * opens. setCarPlates repaints both in place.
 */
const PLATE_SPECS = [
  { on: 'root', pos: [0, 0.596, 2.398], ry: 0 },            // front bumper, faces +z (face z 2.396)
  { on: 'tailgate', pos: [0, -0.725, -0.764], ry: Math.PI }, // rear on the tailgate, faces -z (local; world face -2.347)
];
/** A rounded-rect path (the car's older WebView may lack ctx.roundRect). */
function roundRectPath(x, px, py, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}
function paintPlate(canvas, text) {
  const x = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  // The baked plate is erased to a blank white, so the overlay draws the whole
  // plate look: a white face with a single thin black border and the number.
  // White-on-white hides any size mismatch with the baked plate, so the border
  // is the only one on show (no doubling) and the rear plate keeps its frame.
  x.clearRect(0, 0, W, H);
  const r = Math.round(H * 0.16);
  roundRectPath(x, 0, 0, W, H, r);
  x.fillStyle = '#f6f6f3'; x.fill();
  const bw = Math.max(2, Math.round(H * 0.055));
  roundRectPath(x, bw, bw, W - 2 * bw, H - 2 * bw, Math.max(1, r - bw * 0.6));
  x.lineWidth = bw; x.strokeStyle = '#16181b'; x.stroke();
  const s = String(text || '').trim().toUpperCase().slice(0, 12);
  if (!s) return;
  x.fillStyle = '#16181b'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let fs = Math.round(H * 0.5);
  const fit = () => { x.font = `700 ${fs}px "Space Grotesk","Arial Narrow",system-ui,sans-serif`; return x.measureText(s).width; };
  while (fit() > W * 0.72 && fs > 10) fs -= 2;
  // A touch below centre so it reads as vertically centred on the plate.
  x.fillText(s, W / 2, H * 0.57);
}
function onePlate(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 115;                  // ~4.45:1, matches the quad below
  paintPlate(canvas, text);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(
    // Covers the baked plate's full white face (measured 0.52 x 0.11 on both
    // plates) with a hair to spare, so none of the baked white shows around the
    // overlay — which on a coloured car read as a white margin.
    new THREE.PlaneGeometry(0.525, 0.118),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
  );
  mesh.userData.od = true;              // excluded from part bounding-box walks and twins
  mesh.userData.plate = { canvas, tex };
  mesh.renderOrder = 3;
  return mesh;
}
/** Add the custom plates to the car (idempotent); '' leaves them blank. */
export function mountCarPlates(car, text) {
  if (!car._plates) {
    car._plates = PLATE_SPECS.map((spec) => {
      const m = onePlate(text);
      m.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      m.rotation.set(0, spec.ry, 0);
      // Parent the rear plate to the tailgate so it swings up with it; the front
      // plate (and any fallback) rides the car root.
      const parent = spec.on === 'tailgate' ? (car.nodes.get('tailgate') || car.root) : car.root;
      parent.add(m);
      return m;
    });
  } else {
    setCarPlates(car, text);
  }
}
/** Repaint both plates with new text. */
export function setCarPlates(car, text) {
  if (!car._plates) return;
  for (const m of car._plates) { paintPlate(m.userData.plate.canvas, text); m.userData.plate.tex.needsUpdate = true; }
}

/** Put a mover at t (0 = rest, 1 = extras.od max): hinge angle, slide distance, morph. */
const _q = new THREE.Quaternion();
export function poseMover(e, t) {
  const od = e.od;
  e.node.position.copy(e.restPos);
  e.node.quaternion.copy(e.restQuat);
  if (od.kind === 'hinge') e.node.quaternion.multiply(_q.setFromAxisAngle(e.axis, THREE.MathUtils.degToRad(od.max) * t));
  else if (od.kind === 'slide') e.node.position.addScaledVector(e.dir, od.max * t);
  for (const m of e.morphs) m.mesh.morphTargetInfluences[m.i] = t * (od.morphMax == null ? 1 : od.morphMax);
}
/** Spin (wheels): angle in radians about extras.od.axis. */
export function spinMover(e, angle) {
  e.node.quaternion.copy(e.restQuat).multiply(_q.setFromAxisAngle(e.axis, angle));
}

/** Free every GPU resource of the car (geometry, materials, textures, glow sprites). */
export function disposeCar(car) {
  const seen = new Set();
  car.root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    for (const m of [].concat(o.material || [])) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
      }
      m.dispose();
    }
  });
  for (const t of [glowTexture, lampTexture, amberTexture]) if (t) t.dispose();
  glowTexture = lampTexture = amberTexture = null;
}
