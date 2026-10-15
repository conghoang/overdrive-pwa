/*
 * neo/3d/car3d.js: the 3D hero renderer. OverDrive Neo (U4) adaptation of the fork's phone/3d/car3d.js
 * (FA:phone/3d/car3d.js; UI_PLAN 3.2-3.5; motion owner 2026-10-13, E:\OverDrive\ui-concepts\handoff-3d-motion;
 * DS 4.3-4.6). Loaded by 3d/hero.js with a dynamic import, so three.js (vendor/three, 0.180.0) is fetched only when
 * a screen shows the 3D car.
 *
 * Renderer and scene (QA runtime recommendations, E:\OverDrive\3d\qa\QA_RESULTS.json):
 * - WebGL2, antialias, sRGB output, Khronos PBR Neutral tone mapping at exposure 0.9 (0.95 on a light palette,
 *   setTheme), transparent canvas over the hero's CSS background; pixel ratio min(devicePixelRatio, 3), 2 after 30
 *   slow frames in a row (> 20 ms), applied only at the next frame at rest.
 * - RoomEnvironment through PMREM at intensity 1.0 + one key light 1.6 at (3, 6, 4); no shadow maps; a code-built
 *   contact shadow (one plane, canvas gradient). The car sits in a group (body) that a slammed door rocks.
 * - Camera fov 35, near 0.1, far 60; motion.js Rig (quintic flights) and OrbitInput instead of OrbitControls. Orbit
 *   distance 3.5-9 m, polar 20-85 deg, no pan. Vertical swipes scroll the page (touch-action pan-y), sideways drags turn
 *   the car, two fingers zoom, a quick tap picks a part; the reset button flies back to the rest view.
 * - director.js turns each state change into a shot; 3.2 s after the last one the camera returns to the rest view.
 *   Captions go to hero.js as catalog text; the pop icon over the roof is placed here each frame.
 * - One clock: everything moves on the animation frame's timestamp; an event between frames uses max(last frame, now).
 * - Each frame: director.update -> rig.update -> mapping.step -> render -> labels (chips.js) -> generic pins -> the pop
 *   icon -> onFrame callbacks. Frames run while something moves; ~30 fps while only ambient effects are left; 0 fps at
 *   rest (a one-shot timer wakes the return to rest); stopped while the page is hidden or the hero is off screen.
 * - Prewarm: every shader and texture, the hidden ones too, is compiled and drawn once while the layer is transparent.
 * - destroy() frees every GPU resource and the context.
 * Changes from the fork: Neo class names; the framing fit is a constructor option (Home 1.08, DS 4.3 / D4, the
 * approved reference fit); a generic pin() for overlay elements (port of the reference car-engine.js pin()); a tap that
 * hits no part reports onPick(null, null) (SCREEN-MAP 3.9: empty stage -> Controls).
 * D61 (car on, the approved v2-aurora look): the rest views are the reference car-engine.js angles exactly (home az 39
 * el 15, chargeRest az -138 el 16: director.js VIEWS), and while the approved READY halo (mapping.js) shows, a round
 * cyan ring (the approved ripple texture, steady) lies under the car with it: same 0.9 s fade, same 0.6 -> 1 growth on
 * the start shot, additive on a dark palette, normal blending on a light one (handoff-home-v2 C2, like the ripples).
 */
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/addons/GLTFLoader.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';
import { MeshoptDecoder } from '../vendor/meshopt/meshopt_decoder.module.js';
import { prepareCar, disposeCar, mountCarPlates, setCarPlates } from './model.js';
import { Mapping, ringTexture } from './mapping.js';
import { Badges } from './chips.js';
import { Rig, OrbitInput, D2R } from './motion.js';
import { Director, viewPose, captionText } from './director.js';

export const RENDER = {
  toneMapping: THREE.NeutralToneMapping, exposure: 0.9, environment: 1.0, keyLight: 1.6,
  // A light palette (owner 2026-10-13, handoff-home-v2 C2): exposure 0.95, the contact shadow at 0.8.
  exposureLight: 0.95, shadowLight: 0.8,
  dprMax: 3, dprFallback: 2, fov: 35, near: 0.1, far: 60,
  // Rest views (director.js VIEWS, the approved car-engine.js angles): home = front-left 3/4 (the driver's side, LHD)
  // at az 39 el 15; while a plug is in, chargeRest = the rear-right 3/4 at az -138 el 16 shows the charge port (right
  // side) with its LED and kW label. The orbit target: 0.75 m over the model's origin (its centre).
  target: [0, 0.75, 0],
  minDistance: 3.5, maxDistance: 9, minPolar: 20, maxPolar: 85,
  // The framing: the box corners within this NDC extent (fork 0.98; Home passes 1.08, DS 4.3).
  fit: 0.98
};

/**
 * The car-on ring (D61): the approved ripple texture (mapping.js ringTexture, ring at 214 / 256 of the half plane) in
 * the start ripple's cyan (director.js fx 'start', 0x5AE6FF on every palette, as the reference draws it) held still at
 * `radius` m round the car's centre (inside the 412 x 392 hero at the rest view), under the approved READY halo's own
 * fade and growth. opacity 0 turns it off (the halo alone, the reference engine's look at rest).
 */
export const READY_RING = { radius: 2.3, opacity: 0.5, opacityLight: 0.6, color: 0x5ae6ff };
const RING_SHARE = 214 / 256;

/**
 * The ring's look from the approved halo this frame (exported for tests): level = the halo's 0..1 fade, grow = its
 * scale (0.6 -> 1 as the start shot plays, 1 at rest), light = a light palette.
 */
export function readyRingLook(level, grow, light) {
  const lv = typeof level === 'number' && isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const g = typeof grow === 'number' && isFinite(grow) && grow > 0 ? grow : 1;
  return { visible: lv > 0.001, opacity: (light ? READY_RING.opacityLight : READY_RING.opacity) * lv, scale: g };
}

function readyRing(bounds) {
  const size = (2 * READY_RING.radius) / RING_SHARE;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: ringTexture(), color: READY_RING.color, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending, opacity: 0
  }));
  m.rotation.x = -Math.PI / 2;
  // Between the halo (y 0.004, order -0.5) and the ripples (y 0.006, order -0.4).
  m.position.set(0, 0.005, (bounds.min.z + bounds.max.z) / 2);
  m.renderOrder = -0.45;
  m.visible = false;
  m.raycast = () => {};
  return m;
}

/**
 * The "unlocked" warning ring: the same ground ring in the app's warning amber,
 * shown while the car sits parked, closed and unlocked — a glance-and-know
 * reminder that it isn't locked. Fades in/out; steady (no pulse) so the render
 * loop still idles at rest.
 */
export const WARN_RING = { radius: 2.3, opacity: 0.42, opacityLight: 0.5, color: 0xf3b45e };
const WARN_PATHS = ['doors.lf', 'doors.rf', 'doors.lr', 'doors.rr', 'doors.hood', 'doors.trunk'];
function warnRing(bounds) {
  const size = (2 * WARN_RING.radius) / RING_SHARE;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: ringTexture(), color: WARN_RING.color, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending, opacity: 0
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.0048, (bounds.min.z + bounds.max.z) / 2);
  m.renderOrder = -0.44;
  m.visible = false;
  m.raycast = () => {};
  return m;
}

function contactShadow() {
  const W = 256;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const sx = 2.7 / W;
  const sz = 5.6 / H;
  x.save();
  x.translate(W / 2, H / 2);
  x.scale(1, (H / W) * 0.93);
  let g = x.createRadialGradient(0, 0, 10, 0, 0, W / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.38)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, W / 2, 0, Math.PI * 2);
  x.fill();
  x.restore();
  for (const [wx, wz] of [[0.81, 1.365], [-0.81, 1.365], [0.81, -1.365], [-0.81, -1.365]]) {
    x.save();
    x.translate(W / 2 - wx / sx, H / 2 - wz / sz);
    x.scale(1, 2.2);
    g = x.createRadialGradient(0, 0, 2, 0, 0, 26);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 26, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 5.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.renderOrder = -1;
  m.raycast = () => {};
  return m;
}

// Part picked by a tap: the first named ancestor that is a part.
export const PART = /^(door_(FL|FR|RL|RR)|glass_(FL|FR|RL|RR)|mirror_[LR]|hood|tailgate|tailgate_glass|sunroof_glass|sunshade|flap_charge|flap_fuel|led_charge|wheel_(FL|FR|RL|RR)|calipers_static|interior|screen_center|screen_cluster|glass_fixed|lamp_[A-Za-z0-9_]+|body)$/;

/** The animation clock (s): the frame's timestamp; an event between frames uses max(last frame, now). */
class Clock {
  constructor() { this.last = 0; }
  now() { return Math.max(this.last, performance.now() / 1000); }
  frame(ts) { this.last = Math.max(this.last, ts / 1000); return this.last; }
}

const STATS_MS = 2000;     // frame-gap window of stats() (K9)
const _pop = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pw = new THREE.Vector3();
const _pn = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _pd = new THREE.Vector3();
const PIN_EDGE = 6;

export class Car3D {
  /**
   * env = {h, t, icon, isNum, fmt, vis: {on('hide' | 'show')}}; box = the layer to draw in; opts: {bytes (promise of
   * the GLB ArrayBuffer), read(path), demo, labels, light, fit, onFirstFrame(), onFail(code), onPick(part | null,
   * point | null), onMoved(moved), onCaption(text, icon, holdS), onPop(kind), popEl}
   */
  constructor(od, box, opts) {
    this.od = od;
    this.box = box;
    this.opts = opts;
    this.dead = false;
    this.raf = 0;
    this.timer = 0;
    this.visible = true;
    this.onScreen = true;
    this.slow = 0;
    this.wantDpr = false;
    this.chained = false;
    this.drewBusy = false;
    this.lastTs = 0;
    this.lastRender = 0;
    this.moved = false;
    this.offs = [];
    this.clock = new Clock();
    this.gaps = [];
    this.popUntil = -1;
    this.input = null;
    this.light = !!opts.light;
    this.fit = typeof opts.fit === 'number' && isFinite(opts.fit) && opts.fit > 0.2 && opts.fit < 2 ? opts.fit : RENDER.fit;
    this.frameCbs = [];
    this.pins = [];
  }

  /** f(now) after every drawn frame (car-engine.js onFrame): the lock icon follows what the car shows. */
  onFrame(f) {
    this.frameCbs.push(f);
    return () => {
      const i = this.frameCbs.indexOf(f);
      if (i >= 0) this.frameCbs.splice(i, 1);
    };
  }

  /**
   * A generic overlay pinned to the car (reference car-engine.js pin()): spec {node, offset, normal, minFacing} (a
   * point offset from a node, hidden when the normal faces away) or {anchor, minFacing} (a model.js anchor in its
   * part's frame). Placed by fractional translate3d after every drawn frame, kept inside the box. Returns unpin().
   */
  pin(el, spec) {
    const p = Object.assign({ el, w: 0, h: 0 }, spec || {});
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.willChange = 'transform';
    this.pins.push(p);
    this.invalidate();
    return () => {
      const i = this.pins.indexOf(p);
      if (i >= 0) this.pins.splice(i, 1);
    };
  }

  placePins() {
    if (!this.pins.length || !this.car) return;
    const w = this.size.w;
    const h = this.size.h;
    this.camera.getWorldPosition(_pc);
    for (const p of this.pins) {
      let vis = true;
      const a = p.anchor ? this.car.anchors[p.anchor] : null;
      if (a) {
        a.node.localToWorld(_pw.copy(a.local));
        _pn.copy(a.normal);
        if (a.normalLocal) _pn.transformDirection(a.node.matrixWorld);
        vis = _pn.dot(_pd.copy(_pc).sub(_pw).normalize()) > (p.minFacing != null ? p.minFacing : 0.12);
      } else {
        const node = p.node ? this.car.nodes.get(p.node) : null;
        if (node) node.getWorldPosition(_pw);
        else _pw.set(0, 0, 0);
        if (p.offset) _pw.add(_pd.fromArray(p.offset));
        if (p.normal) {
          _pn.fromArray(p.normal);
          vis = _pn.dot(_pd.copy(_pc).sub(_pw).normalize()) > (p.minFacing != null ? p.minFacing : -0.1);
        }
      }
      _pw.project(this.camera);
      vis = vis && _pw.z < 1 && Math.abs(_pw.x) < 1.1 && Math.abs(_pw.y) < 1.1;
      const o = vis ? '' : '0';
      if (p.el.style.opacity !== o) p.el.style.opacity = o;
      if (!p.w && p.el.offsetWidth) {
        p.w = p.el.offsetWidth;
        p.h = p.el.offsetHeight;
      }
      const hw = p.w / 2 + PIN_EDGE;
      const hh = p.h / 2 + PIN_EDGE;
      const x = Math.max(hw, Math.min(w - hw, ((_pw.x + 1) / 2) * w));
      const y = Math.max(hh, Math.min(h - hh, ((1 - _pw.y) / 2) * h));
      p.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }
  }

  /**
   * Load the model and draw the first frame; resolves true, or false when destroy() came first. A destroy() while
   * this is still awaiting the model, the parser or the shader compile frees the GPU resources here, once the
   * await returns (never under a running compileAsync).
   */
  async start() {
    this.starting = true;
    try {
      return await this.load();
    } finally {
      this.starting = false;
      if (this.dead) this.release();
    }
  }

  async load() {
    const od = this.od;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) {
      const err = new Error('webgl2');
      err.code = 'webgl';
      throw err;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.dprMax));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = RENDER.toneMapping;
    renderer.toneMappingExposure = RENDER.exposure;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = 'neo-hero-canvas';
    this.box.insertBefore(canvas, this.box.firstChild);    // under the badges

    const scene = this.scene = new THREE.Scene();
    const camera = this.camera = new THREE.PerspectiveCamera(RENDER.fov, 1, RENDER.near, RENDER.far);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.envRT = pmrem.fromScene(room, 0.04);
    room.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    pmrem.dispose();
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = RENDER.environment;
    const key = new THREE.DirectionalLight(0xffffff, RENDER.keyLight);
    key.position.set(3, 6, 4);
    scene.add(key);
    this.shadow = contactShadow();
    scene.add(this.shadow);

    const buf = await this.opts.bytes;
    if (this.dead) return false;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(buf.slice(0), '');
    if (this.dead) {
      gltf.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      return false;
    }
    this.car = prepareCar(gltf.scene);
    // The car's own group: a slammed door rocks it (pitch / roll), the shadow and the ground effects stay.
    const body = this.body = new THREE.Group();
    body.add(this.car.root);
    scene.add(body);
    // Custom number plates covering the baked ones (front + rear).
    if (this.opts.plate != null) mountCarPlates(this.car, this.opts.plate);
    const reduced = this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const rig = this.rig = new Rig({ phMin: RENDER.minPolar * D2R, phMax: RENDER.maxPolar * D2R, rMin: RENDER.minDistance, rMax: RENDER.maxDistance });
    rig.reduced = reduced;
    this.base = new THREE.Vector3().fromArray(RENDER.target);
    this.director = new Director({
      read: this.opts.read,
      rig,
      reduced,
      pose: (k, zoom) => this.pose(k, zoom),
      held: () => !!(this.input && this.input.active),
      caption: (label, icon, holdS) => { if (this.opts.onCaption) this.opts.onCaption(captionText(label, od.t), icon, holdS); },
      pop: (kind, now) => this.pop(kind, now)
    });
    this.mapping = new Mapping(this.car, this.director.get, scene, body);
    this.mapping.reduced = reduced;
    this.ring = readyRing(this.car.bounds);
    scene.add(this.ring);
    this.warnRing = warnRing(this.car.bounds);
    scene.add(this.warnRing);
    this.warn = { level: 0 };
    this.applyTheme();
    this.director.mapping = this.mapping;
    this.badges = new Badges(od, this.opts.labels, this.car);
    this.onFrame(() => this.badges.paintLock(this.director.get));
    const now = this.clock.now();
    this.mapping.sync(now, true);
    this.badges.update(this.opts.read);

    // The page scrolls with vertical swipes; sideways drags turn the car; pinch zooms.
    canvas.style.touchAction = 'pan-y';
    this.input = new OrbitInput(canvas, rig, {
      size: () => this.size,
      take: () => { this.director.userTook(this.clock.now()); },
      change: () => this.invalidate()
    });

    this.resize();
    rig.viewKey = this.director.restView();
    rig.jump(this.pose(rig.viewKey));
    rig.apply(camera);
    // Prewarm: compile and upload every shader and texture, the hidden ones too, and draw once while the 3D layer is
    // still transparent; then hide them again.
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try {
      if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
      if (!this.dead) renderer.render(scene, camera);
    } finally {
      for (const o of hidden) o.visible = false;
    }
    if (this.dead) return false;
    this.renderNow(this.clock.now());
    this.listen(canvas);
    this.live = true;
    this.opts.onFirstFrame();
    this.invalidate();
    return true;
  }

  listen(canvas) {
    const od = this.od;
    const ro = new ResizeObserver(() => {
      this.resize();
      if (!this.rig.traj && !this.rig.manual) this.rig.jump(this.pose(this.rig.viewKey));
      this.invalidate();
    });
    ro.observe(this.box);
    this.offs.push(() => ro.disconnect());
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((list) => {
        this.onScreen = list[list.length - 1].isIntersecting;
        if (this.onScreen) this.invalidate();
        else this.stopLoop();
      });
      io.observe(this.box);
      this.offs.push(() => io.disconnect());
    }
    if (od.vis && typeof od.vis.on === 'function') {
      this.offs.push(od.vis.on('hide', () => { this.visible = false; this.stopLoop(); }));
      this.offs.push(od.vis.on('show', () => { this.visible = true; this.invalidate(); }));
    }
    // A tap (no drag) picks a part.
    let down = null;
    const pd = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; };
    const pu = (e) => {
      if (!down || e.pointerId !== down.id) return;
      const d = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (d < 10 && quick) this.pick(e.clientX, e.clientY);
    };
    const pc = () => { down = null; };
    canvas.addEventListener('pointerdown', pd);
    canvas.addEventListener('pointerup', pu);
    canvas.addEventListener('pointercancel', pc);
    const lost = (e) => {
      e.preventDefault();
      this.stopLoop();
      if (!this.dead) this.opts.onFail('lost');
    };
    canvas.addEventListener('webglcontextlost', lost);
    this.offs.push(() => {
      canvas.removeEventListener('pointerdown', pd);
      canvas.removeEventListener('pointerup', pu);
      canvas.removeEventListener('pointercancel', pc);
      canvas.removeEventListener('webglcontextlost', lost);
    });
  }

  resize() {
    const w = Math.max(1, this.box.clientWidth);
    const h = Math.max(1, this.box.clientHeight);
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.badges) this.badges.dirty = true;     // the chips column moved with the hero
  }

  /**
   * The distance that shows the whole car from direction dir looking at ctr (the QA fit search: the box corners within
   * `fit` of the view); not yet kept within the orbit limits.
   */
  fitDistance(dir, ctr) {
    const cam = this.camera.clone();
    const box = this.car.bounds;
    const d = dir.clone().normalize();
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [0, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    let lo = 1.5;
    let hi = 40;
    const p = new THREE.Vector3();
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      cam.position.copy(ctr).addScaledVector(d, mid);
      cam.lookAt(ctr);
      cam.updateMatrixWorld();
      let mx = 0;
      for (const c of corners) {
        p.copy(c).project(cam);
        mx = Math.max(mx, Math.abs(p.x), Math.abs(p.y));
      }
      if (mx > this.fit) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  /** The camera pose of a director view (director.js VIEWS, home and chargeRest included: the approved angles). */
  pose(key, zoom) {
    return viewPose(key, zoom, {
      fit: (th, ph, tgt) => this.fitDistance(_dir.setFromSphericalCoords(1, ph, th), tgt),
      base: this.base,
      centers: this.car.centers,
      rMin: RENDER.minDistance,
      rMax: RENDER.maxDistance
    });
  }

  /** Back to the rest view (the reset button). */
  resetView() {
    if (!this.director || this.dead) return;
    this.director.rest(this.clock.now());
    this.invalidate();
  }

  /** A command is about to go out: turn to where the car will answer (director.js VIEWS key). */
  preview(view) {
    if (!this.director || this.dead) return;
    this.director.preview(view, this.clock.now());
    this.invalidate();
  }

  /** A command failed: back to the rest view. */
  commandFailed() {
    if (!this.director || this.dead) return;
    this.director.failed(this.clock.now());
    this.invalidate();
  }

  /** A shot without a state change ('flash': a find-car or flash the car accepted). */
  pulse(kind) {
    if (!this.director || this.dead) return;
    this.director.pulse(kind, this.clock.now());
    this.invalidate();
  }

  /**
   * The page turned light or dark (a palette, handoff-home-v2 C2): exposure 0.95 / 0.9, the contact shadow 0.8 / 1,
   * the ripples, the READY halo (mapping.js) and the car-on ring blending normally / additively; next frame.
   */
  setTheme(light) {
    this.light = !!light;
    if (!this.mapping || this.dead) return;
    this.applyTheme();
    if (this.live) this.invalidate();     // still loading: the first frame draws it
  }

  applyTheme() {
    this.renderer.toneMappingExposure = this.light ? RENDER.exposureLight : RENDER.exposure;
    this.shadow.material.opacity = this.light ? RENDER.shadowLight : 1;
    this.mapping.setTheme(this.light);
    for (const r of [this.ring, this.warnRing]) {
      if (!r) continue;
      // Added light vanishes on white: normal blending there, like the ripples (car-engine.js setTheme).
      r.material.blending = this.light ? THREE.NormalBlending : THREE.AdditiveBlending;
      r.material.needsUpdate = true;
    }
    if (this.ring) this.placeRing();
  }

  /** The car-on ring follows the approved READY halo: its fade (level) and its growth (scale); drawn with the frame. */
  placeRing() {
    const r = this.ring;
    const h = this.mapping && this.mapping.halo;
    if (!r || !h) return;
    const k = readyRingLook(h.level, h.mesh.scale.x, this.light);
    r.visible = k.visible;
    r.material.opacity = k.opacity;
    r.scale.set(k.scale, k.scale, 1);
  }

  /**
   * The unlocked-warning ring: shown while the car is parked (ignition off),
   * every door and lid closed, and unlocked. Fades in/out over ~0.6 s and, while
   * up, breathes (a slow opacity + scale pulse) so it reads as a live warning,
   * like the blue READY halo animates. Returns true while visible or fading so
   * the frame loop keeps running the pulse (and stops once it's hidden).
   */
  placeWarnRing(now, dt) {
    const r = this.warnRing;
    if (!r) return false;
    const read = this.opts.read;
    const unlocked = read('lock.driver') === false;
    const parked = read('power.acc') !== true;
    const closed = WARN_PATHS.every((k) => read(k) !== true);
    const target = unlocked && parked && closed ? 1 : 0;
    const lv = this.warn.level;
    const step = (dt > 0 ? dt : 1 / 60) / 0.6;
    const nl = lv === target ? target : Math.abs(target - lv) <= step ? target : lv + Math.sign(target - lv) * step;
    this.warn.level = nl;
    const vis = nl > 0.001;
    r.visible = vis;
    if (vis) {
      // 2.4 s breath: opacity 0.6 -> 1 of base, radius ±3 %.
      const phase = 0.5 + 0.5 * Math.sin((2 * Math.PI * now) / 2.4);
      const base = this.light ? WARN_RING.opacityLight : WARN_RING.opacity;
      r.material.opacity = base * nl * (0.6 + 0.4 * phase);
      const s = 0.97 + 0.03 * phase;
      r.scale.set(s, s, 1);
    }
    return vis || nl !== target;
  }

  /** The live state changed: what is not the director's (kW, %, paint) applies now; it compares the rest next frame. */
  update() {
    if (!this.mapping || this.dead) return;
    this.applyState(this.clock.now());
    this.invalidate();
  }

  applyState(now) {
    this.mapping.sync(now, false);
    this.badges.update(this.opts.read);
  }

  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObject(this.car.root, true);
    for (const hit of hits) {
      if (!hit.object.visible) continue;
      for (let o = hit.object; o; o = o.parent) {
        if (o.name && PART.test(o.name)) {
          this.opts.onPick(o.name, hit.point);
          return;
        }
      }
    }
    // The empty stage around the car (SCREEN-MAP 3.9).
    this.opts.onPick(null, null);
  }

  // ---------------------------------------------------------------- the pop icon over the roof
  pop(kind, now) {
    const el = this.opts.popEl;
    if (!el) return;
    this.popUntil = now + 1.9;
    el.hidden = false;
    if (this.opts.onPop) this.opts.onPop(kind);
  }

  placePop(now) {
    const el = this.opts.popEl;
    if (!el || el.hidden) return;
    if (now > this.popUntil) { el.hidden = true; return; }
    const b = this.car.bounds;
    _pop.set(0, b.max.y + 0.3, (b.min.z + b.max.z) / 2).project(this.camera);
    // Fractional px, transform only: no pixel steps, no layout.
    el.style.transform = `translate3d(${((_pop.x + 1) / 2) * this.size.w}px, ${((1 - _pop.y) / 2) * this.size.h}px, 0)`;
  }

  // ---------------------------------------------------------------- render on demand
  invalidate() {
    if (this.dead || this.raf || !this.visible || !this.onScreen || !this.mapping) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
    this.raf = requestAnimationFrame((ts) => this.frame(ts));
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.raf = 0;
    this.timer = 0;
    this.chained = false;
    this.drewBusy = false;
  }

  draw(now) {
    this.renderer.render(this.scene, this.camera);
    this.badges.place(this.camera, this.size.w, this.size.h);
    this.placePins();
    this.placePop(now);
    for (const f of this.frameCbs) f(now);
  }

  /** The first frame (load): camera, parts and lamps at `now`, drawn. */
  renderNow(now) {
    this.rig.apply(this.camera);
    const st = this.mapping.step(now, this.camera);
    this.placeRing();
    this.placeWarnRing(now, 1 / 60);
    this.draw(now);
    return st;
  }

  frame(ts) {
    this.raf = 0;
    if (this.dead || !this.visible || !this.onScreen) return;
    // Waking up after a rest, the first step is one frame long: a fading lamp must not jump.
    const gap = this.chained ? ts - this.lastTs : 0;
    const dt = this.chained ? Math.min(0.1, Math.max(0, gap / 1000)) : 1 / 60;
    this.lastTs = ts;
    const now = this.clock.frame(ts);
    if (!this.chained) this.mapping.last = now - dt;
    if (this.opts.demo && this.opts.demo.tick(now)) {
      this.mapping.setWheelSpeed(this.opts.demo.wheelSpeed());
      this.applyState(now);
    }
    this.director.update(now);
    const input = this.input;
    const camMoving = this.rig.update(now, dt, input.active);
    this.rig.apply(this.camera);
    const st = this.mapping.step(now, this.camera);
    this.placeRing();
    const warnActive = this.placeWarnRing(now, dt);
    const popOn = !!(this.opts.popEl && !this.opts.popEl.hidden);
    const busy = camMoving || st.active || input.active || this.director.busy() || popOn || !!this.opts.demo;
    // Only blinks, pulses or dots (or a batch still collecting): ~30 fps on vsync instead of every frame.
    // The warning ring's slow breath rides here too, so it animates at 30 fps rather than full rate.
    const lazy = !busy && (st.ambient || this.director.waiting() || warnActive);
    // Adaptive pixel ratio: 30 frames in a row slower than 20 ms while moving -> 1.5, set at the next frame at rest.
    if (busy && gap > 0) {
      this.slow = gap > 20 && gap < 200 ? this.slow + 1 : 0;
      if (this.slow >= 30 && this.renderer.getPixelRatio() > RENDER.dprFallback) {
        this.wantDpr = true;
        this.slow = 0;
      }
    }
    let force = false;
    if (!busy && this.wantDpr) {
      this.wantDpr = false;
      this.renderer.setPixelRatio(RENDER.dprFallback);
      this.resize();
      force = true;
    }
    if (force || !lazy || ts - this.lastRender > 30) {
      this.draw(now);
      if (busy && this.drewBusy && ts - this.lastRender < 250) this.noteGap(ts, ts - this.lastRender);
      this.drewBusy = busy;
      this.lastRender = ts;
    } else {
      this.drewBusy = false;
    }
    if (this.rig.manual !== this.moved) {
      this.moved = this.rig.manual;
      if (this.opts.onMoved) this.opts.onMoved(this.moved);
    }
    this.chained = busy || st.ambient || this.director.waiting() || warnActive;
    if (this.chained) {
      if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
      return;
    }
    // At rest: no frames. The director's return to the rest view wakes the loop once.
    this.drewBusy = false;
    const at = this.director.restAt;
    if (at != null && !this.raf) {
      this.timer = setTimeout(() => { this.timer = 0; this.invalidate(); }, Math.max(0, (at - now) * 1000 + 5));
    }
  }

  /** A frame gap (ms) while moving, for stats(); the last 2 s are kept. */
  noteGap(ts, d) {
    const g = this.gaps;
    g.push([ts, d]);
    while (g.length && ts - g[0][0] > STATS_MS) g.shift();
    if (g.length > 400) g.splice(0, g.length - 400);
  }

  /** Numbers for the diagnostics (and the owner's K9 check). */
  stats() {
    const r = this.renderer;
    const lit = new Set();
    for (const L of this.car.lamps) if (L.level > 0.01) lit.add(L.group);
    const open = this.mapping.movers.filter((m) => m.t > 0.001).map((m) => `${m.name} ${Math.round(m.t * 100)}%`);
    const t = performance.now();
    const d = this.gaps.filter((g) => t - g[0] <= STATS_MS).map((g) => g[1]).sort((a, b) => a - b);
    const median = d.length ? d[d.length >> 1] : null;
    const cur = this.director.cur;
    return {
      calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs ? r.info.programs.length : null,
      pixelRatio: r.getPixelRatio(), size: this.size, lit: Array.from(lit), open,
      view: this.rig.manual ? 'owner' : this.rig.viewKey,
      // Gaps between frames drawn while moving, last 2 s: median, slowest, count over 1.5 x median.
      frames: {
        n: d.length, medianMs: median == null ? null : +median.toFixed(1), worstMs: d.length ? +d[d.length - 1].toFixed(1) : null,
        slow: median == null ? 0 : d.filter((x) => x > 1.5 * median).length, fps: median ? Math.round(1000 / median) : null
      },
      shot: cur ? { view: cur.view, label: captionText(cur.label, this.od.t), played: !!cur.played } : null,
      // The approved READY halo's level and the car-on ring's opacity (D61).
      halo: +this.mapping.halo.level.toFixed(3), ring: this.ring && this.ring.visible ? +this.ring.material.opacity.toFixed(3) : 0,
      queue: this.director.queue.length,
      reduced: this.reduced
    };
  }

  /** Set the custom plate text (front + rear); mounts them if the car is loaded. */
  setPlate(text) {
    this.opts.plate = text;
    if (!this.car || this.dead) return;
    if (this.car._plates) setCarPlates(this.car, text);
    else mountCarPlates(this.car, text);
    this.invalidate();
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.stopLoop();
    // Still loading: start() releases everything when its current await returns.
    if (!this.starting) this.release();
  }

  /** Free every GPU resource and the WebGL context (once). */
  release() {
    if (this.released) return;
    this.released = true;
    this.offs.forEach((f) => { try { f(); } catch (e) { /* already gone */ } });
    this.offs = [];
    if (this.input) this.input.dispose();
    if (this.badges) this.badges.destroy();
    if (this.mapping) this.mapping.dispose();
    if (this.car) disposeCar(this.car);
    if (this.shadow) {
      this.shadow.geometry.dispose();
      this.shadow.material.map.dispose();
      this.shadow.material.dispose();
    }
    for (const r of [this.ring, this.warnRing]) {
      if (!r) continue;
      r.geometry.dispose();
      r.material.map.dispose();
      r.material.dispose();
      if (r.parent) r.parent.remove(r);
    }
    if (this.envRT) this.envRT.dispose();
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
    if (this.opts.popEl) this.opts.popEl.hidden = true;
    this.pins = [];
    this.frameCbs = [];
    this.scene = this.car = this.mapping = this.director = this.ring = this.warnRing = null;
  }
}
