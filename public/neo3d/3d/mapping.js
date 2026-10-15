/*
 * phone/3d/mapping.js: live state -> the 3D car (UI_PLAN 3.5 table, 5.4 store paths; step S6b; motion owner 2026-10-13,
 * E:\OverDrive\ui-concepts\handoff-3d-motion). Pure state reading: `read(path)` is the director's view of the store
 * (director.get: what the 3D car plays now for the watched paths, od.store.get for the rest) or the demo script;
 * null = unknown = neutral (closed, off), never a guess.
 *
 * Movers use extras.od only (axis/dir and max from the model; no angle is written here): t = 1 when open, windows,
 * sunroof and shade t = percent / 100. Each kind has its own curves and times (SPEC: a door springs open and slams
 * shut, the tailgate cinches, a flap snaps); a part reversed in mid-move carries on from its speed (a quintic); the
 * sunroof opens shade first (glass 0.6 s later) and closes glass first (shade 1.1 s later); a slam rocks the body
 * (amp deg x e^(-t/0.22) x sin(2 pi 3.1 t), 1.3 s). The first state after load is applied without animation.
 * Lamps switch their own material's emissive strength (authored ON level). Turn and hazard BLINK at 1.5 Hz
 * (333 ms on / 333 ms off, 40 ms ramps) on one shared clock (both sides in phase for hazard); the rear sequential
 * segments _01, _02, _03 start 30 ms apart (out/NOTES.md). Lamp effects (the director's lock / unlock / start / flash
 * blinks and welcome lights) add on top: level = max(state, effect). The front DRL and indicator share one surface
 * (extras.lightSurface): the DRL shows while lit and no signal (state or effect) is on that side, so it fades out
 * instead of vanishing and the welcome lights work with the car off.
 * Ambient effects: screens 30 % in ACC and 100 % ON + a round cyan READY halo (0.9 s fade, grows 0.6 -> 1 when READY
 * starts); A/C airflow sprites from the dash (blue cooling, orange heating); the charge LED pulses with kW while
 * charging (green up to 11 kW, cyan above), steady green when full, steady red on a fault, orange pulse for V2L, and
 * 16 energy dots flow into the port while charging. Round ripples spread from under the car (lock, unlock, start, find).
 * Wheels stay still (the live state has no reliable speed for the hero); they spin only in the demo.
 */
import * as THREE from '../vendor/three/three.module.min.js';
import { poseMover, spinMover, setPaint, updateGlow, dotTexture } from './model.js';
import { E, springEase, latchEase, cinchEase, Quintic, smooth, D2R } from './motion.js';

const isNum = (x) => typeof x === 'number' && isFinite(x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Per kind: open / close time (ms) and curve; impact = the curve point where a slam rocks the body (rock deg x side). */
export const SPEC = {
  door: { open: { ms: 1300, ease: springEase(0.75, 6.5) }, close: { ms: 640, ease: latchEase(0.78, 0.02, 2.2), impact: 0.78, rock: { axis: 'z', amp: -0.3 } } },
  hood: { open: { ms: 1300, ease: E.inOutCubic }, close: { ms: 880, ease: latchEase(0.8, 0.015, 2.0), impact: 0.8, rock: { axis: 'x', amp: 0.3 } } },
  tail: { open: { ms: 2200, ease: E.smoother }, close: { ms: 2200, ease: cinchEase(0.86, 0.035), impact: 0.86, rock: { axis: 'x', amp: -0.22 } } },
  flap: { open: { ms: 620, ease: springEase(0.6, 11) }, close: { ms: 360, ease: E.inCubic } },
  glass: { open: { ms: 1500, ease: E.inOutSine, scaled: true }, close: { ms: 1500, ease: E.inOutSine, scaled: true } },
  roof: { open: { ms: 2000, ease: E.inOutSine, scaled: true }, close: { ms: 2000, ease: E.inOutSine, scaled: true } },
  mirror: { open: { ms: 900, ease: E.inOutCubic }, close: { ms: 900, ease: E.inOutCubic } }
};

const open = (path) => (v) => (v(path) === true ? 1 : 0);
const pct = (path) => (v) => { const p = v(path); return isNum(p) ? clamp01(p / 100) : 0; };
/** A side window: the percentage, else the coarse open/closed read (open = fully down, UI_PLAN 3.5). */
const glass = (k) => (v) => {
  const p = v(`windows.${k}`);
  if (isNum(p)) return clamp01(p / 100);
  return v(`windows.coarse.${k}`) === true ? 1 : 0;
};
/** A plug cannot go in with the flap shut: plugged, charging or V2L opens the charge flap. */
const chargeFlap = (v) => (v('charge.plugged') === true || v('charge.active') === true || v('charge.v2l') === true ? 1 : 0);

// [node, value(read) -> 0..1, kind (SPEC), side (+1 left, -1 right: the roll of a slammed door)]
export const MOVERS = [
  ['door_FL', open('doors.lf'), 'door', 1],
  ['door_FR', open('doors.rf'), 'door', -1],
  ['door_RL', open('doors.lr'), 'door', 1],
  ['door_RR', open('doors.rr'), 'door', -1],
  ['hood', open('doors.hood'), 'hood'],
  ['tailgate', open('doors.trunk'), 'tail'],
  ['flap_fuel', open('doors.fuel'), 'flap'],
  ['flap_charge', chargeFlap, 'flap'],
  ['glass_FL', glass('lf'), 'glass'],
  ['glass_FR', glass('rf'), 'glass'],
  ['glass_RL', glass('lr'), 'glass'],
  ['glass_RR', glass('rr'), 'glass'],
  ['sunroof_glass', pct('windows.sunroof'), 'roof'],
  ['sunshade', pct('windows.shade'), 'roof'],
  // No fold read-back today (UI_PLAN 3.5): neutral = unfolded until the state carries it.
  ['mirror_L', open('mirrors.folded'), 'mirror'],
  ['mirror_R', open('mirrors.folded'), 'mirror']
];

/** 1.5 Hz blink, 40 ms ramps; segment n starts n x 30 ms later (QA blinkLevel). */
export function blinkLevel(seconds, segment) {
  const phase = seconds % (2 / 3);
  const delay = (segment || 0) * 0.03;
  if (phase < delay) return 0;
  return Math.max(0, Math.min(1, (phase - delay) / 0.04, (1 / 3 - phase) / 0.04));
}
/** n blinks (period s, lit share duty), the rear segments 30 ms apart like the real indicator. */
export const blinkPattern = (n, period, duty) => (t, seg) => {
  const i = Math.floor(t / period);
  if (i >= n) return 0;
  const ph = t - i * period - (seg || 0) * 0.03;
  if (ph < 0) return 0;
  return clamp01(Math.min(ph / 0.04, (period * duty - ph) / 0.04));
};
/** Fade in, hold, fade out (s): the welcome lights. */
export const holdPattern = (fadeIn, hold, fadeOut) => (t) => (t < fadeIn ? E.inOutSine(t / fadeIn) : t < fadeIn + hold ? 1 : clamp01(1 - (t - fadeIn - hold) / fadeOut));
// Fade times (ms) of the steady groups.
export const FADE = { low: 260, high: 180, drl: 480, tail: 380, reverse: 160, brake: 120, screens: 850 };
const LED = { green: [0, 1, 0.1], cyan: [0, 0.75, 1], red: [1, 0.04, 0.04], orange: [1, 0.42, 0] };
const RIPPLE_S = 1.7;
const ROCK_S = 1.3;

/** The round ripple: a thin ring with a soft glow, outer radius 0.84 x half the plane. */
export function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.strokeStyle = '#fff';
  x.shadowColor = '#fff';
  for (const [w, blur, a] of [[12, 30, 0.5], [6, 14, 0.8], [3, 0, 1]]) {
    x.globalAlpha = a;
    x.lineWidth = w;
    x.shadowBlur = blur;
    x.beginPath();
    x.arc(256, 256, 214, 0, Math.PI * 2);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** The round READY halo (owner 2026-10-13, instead of the oval): a soft ring round the car, clear in the middle. */
export function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  // 6.2 m plane, radius 3.1 m: clear to 0.8 m, brightest at 1.75 m (along the sides), gone at 2.9 m.
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(90,230,255,0)');
  g.addColorStop(0.26, 'rgba(90,230,255,0)');
  g.addColorStop(0.56, 'rgba(90,230,255,0.6)');
  g.addColorStop(0.75, 'rgba(90,230,255,0.25)');
  g.addColorStop(0.94, 'rgba(90,230,255,0)');
  g.addColorStop(1, 'rgba(90,230,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const dot = (color, order) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTexture(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0
  }));
  s.renderOrder = order;
  s.raycast = () => {};
  return s;
};
/** A flat effect on the ground: additive, never written to depth, never picked. */
const groundPlane = (geo, map, y, z, order) => {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, opacity: 0
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, y, z);
  m.renderOrder = order;
  m.visible = false;
  m.raycast = () => {};
  return m;
};

export class Mapping {
  /** car = model.prepareCar(); read(path) = what to draw; scene for the ground effects; body = the car's group (rocks). */
  constructor(car, read, scene, body) {
    this.car = car;
    this.read = read;
    this.body = body;
    this.reduced = false;      // prefers-reduced-motion: parts x 0.6, no body rock
    this.movers = [];
    for (const [name, value, kind, side] of MOVERS) {
      const e = car.movers.get(name);
      if (!e) continue;
      this.movers.push({ e, name, value, kind, side: side || 1, t: 0, to: 0, mode: 0, from: 0, t0: 0, dur: 0, ease: null,
        q: new Quintic(), impact: 0, rock: null, fired: true });
    }
    this.byName = new Map(this.movers.map((m) => [m.name, m]));
    for (const L of car.lamps) L.base = L.level || 0;   // the steady (state) level, before effects
    this.wheels = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'].map((n) => car.movers.get(n)).filter(Boolean);
    this.wheelAngle = 0;
    this.wheelSpeed = 0;       // m/s, demo only
    this.blinkEpoch = null;
    this.last = null;
    this.paint = null;
    this.state = {};
    this.lampFx = [];
    this.rocks = [];
    this.buildEffects(scene);
  }

  // ---------------------------------------------------------------- effects (code-built, one draw call each)
  buildEffects(scene) {
    const b = this.car.bounds;
    const cz = (b.min.z + b.max.z) / 2;
    // READY halo: round, 6.2 x 6.2 m.
    const halo = groundPlane(new THREE.PlaneGeometry(6.2, 6.2), haloTexture(), 0.004, cz, -0.5);
    scene.add(halo);
    this.halo = { mesh: halo, level: 0, t0: null, was: false };

    // Ripples: three meshes share one 6.4 x 6.4 m plane and one ring texture (a material each: its own colour).
    const ringGeo = new THREE.PlaneGeometry(6.4, 6.4);
    const ringTex = ringTexture();
    this.ripples = [];
    for (let i = 0; i < 3; i++) {
      const m = groundPlane(ringGeo, ringTex, 0.006, cz, -0.4);
      scene.add(m);
      this.ripples.push({ mesh: m, on: false, t0: 0 });
    }

    // A/C: 12 drifting dots from the dash vents, seen through the glass.
    const screen = this.car.nodes.get('screen_center');
    const vent = new THREE.Vector3(0, 0.98, 0.75);
    if (screen) {
      const box = new THREE.Box3().setFromObject(screen, true);
      if (!box.isEmpty()) vent.set(0, box.min.y - 0.02, box.getCenter(new THREE.Vector3()).z - 0.05);
    }
    const air = new THREE.Group();
    air.visible = false;
    const parts = [];
    for (let i = 0; i < 12; i++) {
      const s = dot(0x7cc8ff, 3);
      s.scale.set(0.09, 0.09, 1);
      air.add(s);
      parts.push({ s, x: [-0.42, -0.14, 0.14, 0.42][i % 4], phase: i / 12 });
    }
    this.body.add(air);
    this.air = { group: air, parts, vent, level: 0 };

    // Charging: 16 energy dots on a quadratic Bezier into the port.
    const c = this.car.centers || {};
    const p1 = (c.led_charge || c.flap_charge || new THREE.Vector3(-0.9, 1.05, -1.5)).clone();
    const side = Math.sign(p1.x) || -1;
    const chg = new THREE.Group();
    chg.visible = false;
    const dots = [];
    for (let i = 0; i < 16; i++) {
      const s = dot(0x30ff70, 6);
      chg.add(s);
      dots.push({ s, phase: i / 16, j: (i % 4 - 1.5) * 0.018 });
    }
    this.body.add(chg);
    this.chg = { group: chg, dots, p1, p0: p1.clone().add(new THREE.Vector3(side * 1.3, -0.62, -0.2)),
      c: p1.clone().add(new THREE.Vector3(side * 0.8, 0.32, -0.05)), level: 0 };
  }

  /** The values the hero draws, from read(); cheap, run on every store change. */
  compute() {
    const v = this.read;
    const level = v('power.level');
    const acc = v('power.acc') === true;
    const hazard = v('lights.hazard') === true;
    const st = {
      color: v('meta.color'),
      low: v('lights.low') === true,
      high: v('lights.high') === true,
      // DRL = the switch setting, lit only with the car on (UI_PLAN 5.5).
      drl: v('lights.drl') === true && acc,
      reverse: v('power.gear') === 'R',
      turnL: hazard || v('lights.turnL') === true,
      turnR: hazard || v('lights.turnR') === true,
      screens: level === 2 ? 1 : level === 1 || (level == null && acc) ? 0.3 : 0,
      ready: level === 2,
      ac: v('climate.on') === true,
      cooling: null,
      led: null,
      charging: v('charge.active') === true,
      kw: v('charge.kw')
    };
    const set = v('climate.setC');
    const inside = v('climate.insideC');
    if (isNum(set) && isNum(inside)) st.cooling = set < inside;
    if (v('charge.fault') === true) st.led = { color: 'red', pulse: 0 };
    else if (v('charge.v2l') === true) st.led = { color: 'orange', pulse: 1.2 };
    else if (st.charging) {
      const kw = v('charge.kw');
      st.led = { color: isNum(kw) && kw > 11 ? 'cyan' : 'green', pulse: isNum(kw) ? Math.max(0.6, Math.min(2.4, 2.4 - 0.12 * kw)) : 1.6 };
    } else if (v('charge.full') === true) st.led = { color: 'green', pulse: 0 };
    return st;
  }

  /** A part's position and speed now (a reversal in mid-move carries on from it). [t, dt/ds, done] */
  moverAt(m, now) {
    if (m.mode === 1) {
      if (now < m.t0) return [m.from, 0, false];
      const x = clamp01((now - m.t0) / m.dur), h = 1e-3, x0 = Math.max(0, x - h), x1 = Math.min(1, x + h);
      const v = x1 > x0 ? ((m.ease(x1) - m.ease(x0)) / (x1 - x0)) * (m.to - m.from) / m.dur : 0;
      return [m.from + (m.to - m.from) * m.ease(x), v, x >= 1];
    }
    if (m.mode === 2) { const s = clamp01((now - m.t0) / m.q.T); return [m.q.p(s), m.q.v(s), s >= 1]; }
    return [m.t, 0, true];
  }

  tween(m, to, now, delay) {
    const [p, v] = this.moverAt(m, now);
    const opening = to > p, spec = SPEC[m.kind][opening ? 'open' : 'close'], dist = Math.abs(to - p);
    let ms = spec.scaled ? Math.max(350, spec.ms * dist) : spec.ms;
    if (this.reduced) ms *= 0.6;
    m.from = p;
    m.to = to;
    m.t0 = now + (delay || 0);
    m.dur = ms / 1000;
    if (Math.abs(v) > 0.05) {
      // Reversed in mid-move: a quintic from the current speed, no jolt.
      m.mode = 2;
      m.t0 = now;
      m.q.set(p, v, 0, to, Math.max(0.35, m.dur * Math.min(1, dist + 0.25)));
      m.impact = 0;
      m.fired = true;
    } else {
      m.mode = 1;
      m.ease = spec.ease;
      m.impact = spec.impact || 0;
      m.rock = spec.rock || null;
      m.fired = !m.impact;
    }
  }

  /** Read the state; start tweens toward it (snap = no animation, for the first frame). */
  sync(now, snap) {
    this.state = this.compute();
    if (this.state.color !== this.paint) {
      this.paint = this.state.color;
      setPaint(this.car, this.paint);
    }
    const sh = this.byName.get('sunshade');
    const sg = this.byName.get('sunroof_glass');
    const shadeOpening = sh && sh.value(this.read) > sh.t + 1e-4;
    const glassClosing = sg && sg.value(this.read) < sg.t - 1e-4;
    for (const m of this.movers) {
      const to = clamp01(m.value(this.read));
      if (snap) {
        m.t = m.from = m.to = to;
        m.mode = 0;
        poseMover(m.e, to);
        continue;
      }
      if (Math.abs(to - m.to) < 1e-4) continue;
      // Sunroof: the shade opens first and the glass follows; closing, the glass first.
      const delay = m.name === 'sunroof_glass' && to > m.t && shadeOpening ? 0.6 : m.name === 'sunshade' && to < m.t && glassClosing ? 1.1 : 0;
      this.tween(m, to, now, delay);
    }
    const blinking = this.state.turnL || this.state.turnR;
    if (blinking && this.blinkEpoch == null) this.blinkEpoch = now;
    if (!blinking) this.blinkEpoch = null;
    if (this.state.ready && !this.halo.was) this.halo.t0 = snap ? null : now;
    this.halo.was = this.state.ready;
    if (snap) {
      for (const L of this.car.lamps) L.base = L.level = this.steadyTarget(L);
      this.halo.level = this.state.ready ? 1 : 0;
      this.air.level = this.state.ac ? 1 : 0;
      this.chg.level = this.state.charging ? 1 : 0;
    }
  }

  steadyTarget(L) {
    const s = this.state;
    switch (L.group) {
      case 'low': return s.low ? 1 : 0;
      case 'high': return s.high ? 1 : 0;
      case 'drl': return s.drl ? 1 : 0;
      case 'tail': return s.low ? 1 : 0;      // position lamps follow the low beam
      case 'reverse': return s.reverse ? 1 : 0;
      case 'screens': return s.screens;
      default: return 0;                     // brake: not reported, kept off
    }
  }

  // ---------------------------------------------------------------- the director's effects
  /** A lamp effect on groups from t0 for dur seconds: fn(t since t0, segment) -> 0..1. */
  addLampFx(groups, t0, dur, fn) { this.lampFx.push({ groups: new Set(groups), t0, end: t0 + dur, fn }); }
  fxLevel(group, seg, now) {
    let lv = 0;
    for (const f of this.lampFx) if (f.groups.has(group) && now >= f.t0) lv = Math.max(lv, f.fn(now - f.t0, seg));
    return lv;
  }
  /** An effect blinks this side now (or in 50 ms): its DRL steps aside. */
  fxOn(group, now) {
    for (const f of this.lampFx) if (f.groups.has(group) && now >= f.t0 - 0.05) return true;
    return false;
  }
  ripple(t0, color) {
    const r = this.ripples.find((x) => !x.on) || this.ripples[0];
    r.on = true;
    r.t0 = t0;
    r.mesh.material.color.set(color);
  }
  /** Seconds until everything under way is done (parts, lamp effects, ripples). */
  busyFor(now) {
    let end = now;
    for (const m of this.movers) {
      if (m.mode === 1) end = Math.max(end, m.t0 + m.dur);
      else if (m.mode === 2) end = Math.max(end, m.t0 + m.q.T);
    }
    for (const f of this.lampFx) end = Math.max(end, f.end);
    for (const r of this.ripples) if (r.on) end = Math.max(end, r.t0 + RIPPLE_S);
    return end - now;
  }

  /**
   * Advance to `now` (seconds) and write the GPU state. Returns {active: needs the next frame now, ambient: only
   * blinks, pulses, dots left (drawn at ~30 fps)}.
   */
  step(now, camera) {
    const dt = this.last == null ? 0 : Math.max(0, Math.min(0.25, now - this.last));
    this.last = now;
    let active = false;
    let ambient = false;

    for (const m of this.movers) {
      if (!m.mode) continue;
      const [p, , done] = this.moverAt(m, now);
      if (!m.fired && m.mode === 1 && (now - m.t0) / m.dur >= m.impact) {
        m.fired = true;
        if (!this.reduced && m.rock) this.rocks.push({ t0: now, axis: m.rock.axis, amp: m.rock.amp * m.side });
      }
      m.t = done ? m.to : p;
      poseMover(m.e, m.t);
      if (done) m.mode = 0;
      else active = true;
    }
    if (this.wheelSpeed > 0 && this.wheels.length) {
      this.wheelAngle = (this.wheelAngle + (this.wheelSpeed / 0.369) * dt) % (Math.PI * 2);
      for (const w of this.wheels) spinMover(w, this.wheelAngle);
      active = true;
    }
    // A slam rocks the body: a damped ~3 Hz swing under 0.35 deg (x = pitch, z = roll).
    let pitch = 0;
    let roll = 0;
    if (this.rocks.length) {
      this.rocks = this.rocks.filter((r) => now - r.t0 < ROCK_S);
      for (const r of this.rocks) {
        const t = now - r.t0;
        const a = r.amp * D2R * Math.exp(-t / 0.22) * Math.sin(2 * Math.PI * 3.1 * t);
        if (r.axis === 'x') pitch += a;
        else roll += a;
      }
      active = true;
    }
    this.body.rotation.set(pitch, 0, roll);

    const s = this.state;
    const blinkT = this.blinkEpoch == null ? 0 : now - this.blinkEpoch;
    if (this.blinkEpoch != null) ambient = true;
    if (this.lampFx.length) {
      this.lampFx = this.lampFx.filter((f) => now < f.end);
      if (this.lampFx.length) active = true;
    }
    const sigL = s.turnL || this.fxOn('turnL', now);
    const sigR = s.turnR || this.fxOn('turnR', now);
    for (const L of this.car.lamps) {
      let level;
      if (L.group === 'turnL' || L.group === 'turnR') {
        level = s[L.group] ? blinkLevel(blinkT, L.seg) : 0;
      } else if (L.group === 'charge') {
        level = 0;
        if (s.led) {
          const c = LED[s.led.color];
          L.mat.emissive.setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
          if (L.glow) L.glow.material.color.setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
          level = s.led.pulse ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((2 * Math.PI * now) / s.led.pulse)) : 1;
          if (s.led.pulse) ambient = true;
        }
      } else {
        const target = this.steadyTarget(L);
        if (L.base !== target) {
          const stepAmt = dt > 0 ? (dt * 1000) / (FADE[L.group] || 200) : 0;
          L.base = Math.abs(target - L.base) <= stepAmt ? target : L.base + Math.sign(target - L.base) * stepAmt;
          if (L.base !== target) active = true;
        }
        level = L.base;
      }
      const fx = this.lampFx.length ? this.fxLevel(L.group, L.seg, now) : 0;
      if (fx > level) level = fx;
      L.level = level;
      L.mat.emissiveIntensity = L.on * level;
      // Front DRL / indicator on one surface: the indicator shows while its side signals (state or effect); the DRL
      // shows while lit otherwise, so it fades out instead of vanishing.
      if (L.exclusive) {
        const signal = L.left ? sigL : sigR;
        L.mesh.visible = L.group === 'drl' ? level > 0.001 && !signal : signal;
      }
    }
    if (camera) {
      this.body.updateMatrixWorld();
      for (const L of this.car.lamps) if (L.glow) updateGlow(L.glow, L.level, camera);
    }

    // READY halo: fades over 0.9 s; when READY starts it grows from 0.6 to 1 (outCubic, 1.6 s).
    const h = this.halo;
    const haloTo = s.ready ? 1 : 0;
    if (h.level !== haloTo) {
      const a = dt / 0.9;
      h.level = Math.abs(haloTo - h.level) <= a ? haloTo : h.level + Math.sign(haloTo - h.level) * a;
      if (h.level !== haloTo) active = true;
    }
    const grow = h.t0 == null ? 1 : E.outCubic(clamp01((now - h.t0) / 1.6));
    if (grow < 1 && h.level > 0) active = true;
    h.mesh.visible = h.level > 0.001;
    h.mesh.material.opacity = 0.34 * h.level;
    h.mesh.scale.set(0.6 + 0.4 * grow, 0.6 + 0.4 * grow, 1);

    // Ripples: from ~1.2 m under the car out to ~3.3 m in 1.7 s.
    for (const r of this.ripples) {
      if (!r.on) continue;
      const x = (now - r.t0) / RIPPLE_S;
      active = true;
      if (x < 0) { r.mesh.visible = false; continue; }
      if (x >= 1) { r.on = false; r.mesh.visible = false; continue; }
      const k = E.outCubic(x);
      r.mesh.visible = true;
      r.mesh.scale.set(0.45 + 0.8 * k, 0.45 + 0.8 * k, 1);
      r.mesh.material.opacity = smooth(0, 0.08, x) * (1 - x) ** 1.4;
    }

    // A/C airflow: dots drift back from the vents and fade.
    const air = this.air;
    const airTo = s.ac ? 1 : 0;
    if (air.level !== airTo) {
      const a = dt / 0.4;
      air.level = Math.abs(airTo - air.level) <= a ? airTo : air.level + Math.sign(airTo - air.level) * a;
      if (air.level !== airTo) active = true;
    }
    air.group.visible = air.level > 0.001;
    if (air.group.visible) {
      const col = s.cooling === false ? 0xffa040 : s.cooling === true ? 0x5ab8ff : 0xcfe6ff;
      for (const p of air.parts) {
        const k = (now / 1.6 + p.phase) % 1;
        p.s.position.set(p.x * (1 - 0.25 * k), air.vent.y + 0.06 * k, air.vent.z - 0.75 * k);
        p.s.material.color.setHex(col);
        p.s.material.opacity = air.level * 0.85 * Math.sin(Math.PI * k);
      }
      ambient = true;
    }

    // Charging: the dots speed up with kW (green up to 11 kW, cyan above), 0.5 s fade in and out.
    const c = this.chg;
    const cTo = s.charging ? 1 : 0;
    if (c.level !== cTo) {
      const a = dt / 0.5;
      c.level = Math.abs(cTo - c.level) <= a ? cTo : c.level + Math.sign(cTo - c.level) * a;
      if (c.level !== cTo) active = true;
    }
    c.group.visible = c.level > 0.001;
    if (c.group.visible) {
      const kw = isNum(s.kw) ? s.kw : 6.6;
      const rate = 0.32 + Math.min(kw, 60) / 60 * 0.55;
      const col = kw > 11 ? 0x40c8ff : 0x30ff70;
      for (const d of c.dots) {
        const k = (now * rate + d.phase) % 1, e = k * k, u = 1 - e;
        d.s.position.set(u * u * c.p0.x + 2 * u * e * c.c.x + e * e * c.p1.x, u * u * c.p0.y + 2 * u * e * c.c.y + e * e * c.p1.y + d.j,
          u * u * c.p0.z + 2 * u * e * c.c.z + e * e * c.p1.z);
        const sc = 0.085 * (1 - 0.5 * e);
        d.s.scale.set(sc, sc, 1);
        d.s.material.color.setHex(col);
        d.s.material.opacity = c.level * 0.9 * Math.sin(Math.PI * k) ** 0.7;
      }
      ambient = true;
    }
    return { active, ambient };
  }

  /** Demo / dev: wheels roll at speed m/s (0 = still). */
  setWheelSpeed(ms) { this.wheelSpeed = Math.max(0, ms || 0); }

  /**
   * Light page (owner 2026-10-13, handoff-home-v2 C2; car-engine.js setTheme): the ripples and the READY halo blend
   * normally, since added light vanishes on white, and the halo is tinted #2aa9c9; dark: additive, untinted.
   */
  setTheme(light) {
    for (const m of [this.halo.mesh.material, ...this.ripples.map((r) => r.mesh.material)]) {
      m.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      m.needsUpdate = true;
    }
    this.halo.mesh.material.color.set(light ? 0x2aa9c9 : 0xffffff);
  }

  dispose() {
    const h = this.halo.mesh;
    h.geometry.dispose();
    h.material.map.dispose();
    h.material.dispose();
    if (h.parent) h.parent.remove(h);
    const r0 = this.ripples[0].mesh;
    r0.geometry.dispose();
    r0.material.map.dispose();
    for (const r of this.ripples) {
      r.mesh.material.dispose();
      if (r.mesh.parent) r.mesh.parent.remove(r.mesh);
    }
    for (const p of this.air.parts) p.s.material.dispose();
    for (const d of this.chg.dots) d.s.material.dispose();
    for (const g of [this.air.group, this.chg.group]) if (g.parent) g.parent.remove(g);
  }
}

/**
 * The demo (#/home?demo=1, the owner's "Play all" check K7 on the phone): a looping script over every mover and
 * lamp group, read like the store, played by the director like the live state: unlock (welcome lights), doors, hood,
 * tailgate, fuel flap, windows, sunroof and shade, start (READY halo), A/C, beams, indicator, hazard, reverse, stop,
 * charging (6.6 then 22 kW), find-car (the flash shot through onPulse), four doors, lock. About 3 s a step, more after
 * a long shot (a wide turn, the tailgate, the roof, start, find-car), so each step gets its own shot: the next one
 * comes after it ends (tools/fork/devserver/sim3d.mjs checks it). Never sends anything.
 */
export function demoSource(onPulse) {
  // Every path the director watches has a value: a change from null (unknown) is not an action, it would play no shot.
  const base = {
    'meta.color': '#E8E8EC', 'meta.driveSide': 'lhd', 'lock.driver': true, 'power.acc': false, 'power.level': 0,
    'power.gear': 'P', 'lights.drl': true, 'lights.low': false, 'lights.high': false, 'lights.turnL': false,
    'lights.turnR': false, 'lights.hazard': false, 'mirrors.folded': true,
    'doors.lf': false, 'doors.rf': false, 'doors.lr': false, 'doors.rr': false, 'doors.hood': false, 'doors.trunk': false,
    'doors.fuel': false, 'windows.lf': 0, 'windows.rf': 0, 'windows.lr': 0, 'windows.rr': 0, 'windows.sunroof': 0,
    'windows.shade': 0, 'charge.plugged': false, 'charge.active': false,
    'climate.on': false, 'climate.setC': 22, 'climate.insideC': 30, 'charge.targetPct': 90, 'energy.socPct': 64,
    'lock.scope': 'all', 'lock.doors.lf': true, 'lock.doors.rf': true, 'lock.doors.lr': true, 'lock.doors.rr': true
  };
  const doors = (x) => ({ 'doors.lf': x, 'doors.rf': x, 'doors.lr': x, 'doors.rr': x });
  // Four doors' locks with the driver's (the lock icon: they ride on the lock / unlock shot).
  const locks = (x) => ({ 'lock.driver': x, 'lock.doors.lf': x, 'lock.doors.rf': x, 'lock.doors.lr': x, 'lock.doors.rr': x });
  // [seconds into the loop, {path: value} | 'flash' (a find-car the car accepted)], in order; the loop is 92 s.
  const steps = [
    [0, { ...locks(false), 'mirrors.folded': false }],
    [3, { 'doors.lf': true }], [6, { 'doors.lf': false }], [9, { 'doors.rr': true }], [12.6, { 'doors.rr': false }],
    [15.6, { 'doors.hood': true }], [19, { 'doors.hood': false }],
    [22, { 'doors.trunk': true }], [25.8, { 'doors.trunk': false }],
    [28.8, { 'doors.fuel': true }], [31.8, { 'doors.fuel': false }],
    [34.8, { 'windows.lf': 100, 'windows.rf': 60, 'windows.lr': 40, 'windows.rr': 20 }],
    [38, { 'windows.lf': 0, 'windows.rf': 0, 'windows.lr': 0, 'windows.rr': 0 }],
    [41, { 'windows.shade': 100, 'windows.sunroof': 100 }], [44.6, { 'windows.shade': 0, 'windows.sunroof': 0 }],
    [47.6, { 'power.level': 2, 'power.acc': true }], [51.2, { 'climate.on': true }],
    [54.2, { 'climate.on': false, 'lights.low': true, 'lights.high': true }],
    [57.2, { 'lights.high': false, 'lights.turnL': true }], [60.2, { 'lights.turnL': false, 'lights.hazard': true }],
    [63.2, { 'lights.hazard': false, 'lights.low': false, 'power.gear': 'R' }],
    [66.2, { 'power.level': 0, 'power.acc': false, 'power.gear': 'P' }],
    [69.2, { 'charge.plugged': true, 'charge.active': true, 'charge.kw': 6.6 }], [72.4, { 'charge.kw': 22 }],
    [75.4, { 'charge.active': false, 'charge.plugged': false, 'charge.kw': null }],
    [78.4, 'flash'],
    [82, doors(true)], [85, doors(false)],
    [88, { ...locks(true), 'mirrors.folded': true }]
  ];
  const LOOP = 92;
  let t0 = null;            // the loop starts with the first drawn frame (the model may take a while to load)
  let cur = { ...base };
  let at = -1;
  return {
    read: (path) => (cur[path] === undefined ? null : cur[path]),
    /** Advance the script; true when the state changed. A pulse step reached within the last second calls onPulse. */
    tick(now) {
      if (t0 == null) t0 = now;
      const t = (now - t0) % LOOP;
      let idx = -1;
      for (let i = 0; i < steps.length; i++) if (steps[i][0] <= t) idx = i;
      if (idx === at) return false;
      const fresh = idx > at ? at + 1 : 0;
      cur = { ...base };
      for (let i = 0; i <= idx; i++) if (typeof steps[i][1] === 'object') Object.assign(cur, steps[i][1]);
      at = idx;
      for (let i = fresh; i <= idx; i++) {
        if (typeof steps[i][1] === 'string' && onPulse && t - steps[i][0] < 1) onPulse(steps[i][1]);
      }
      return true;
    },
    wheelSpeed: () => (cur['power.level'] === 2 ? 2.2 : 0)
  };
}
