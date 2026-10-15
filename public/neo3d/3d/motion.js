/*
 * phone/3d/motion.js: the hero's motion maths (owner 2026-10-13, E:\OverDrive\ui-concepts\handoff-3d-motion; replaces
 * OrbitControls). No DOM but the canvas OrbitInput listens on; three.js only for the camera target vector.
 *
 * - Easing curves of the parts: springEase (a spring from rest, f(1) = 1), latchEase (a slam with a small rebound),
 *   cinchEase (a power tailgate: motor almost shut, then the latch pulls it in), smoother, in/out cubic and sine.
 * - Quintic: the minimum-jerk path from (p0, v0, a0) to p1, at rest after T seconds. A new goal in mid-move starts
 *   from the current speed and acceleration, so the camera or a part never jerks when it changes its mind.
 * - Rig: the camera as six channels [theta, phi, r, tx, ty, tz] (theta like THREE.Spherical: 0 = the car's nose +Z,
 *   +90 deg = its left side +X). flyTo() = one quintic per channel (+ a crane lift on long turns); a finger moves a
 *   goal that the camera follows with a frame-rate-independent smoothing k = 1 - e^(-18 dt), plus a fling.
 * - OrbitInput: pointers only add to rig.goal; the camera is computed once per frame, in the animation frame.
 */
import * as THREE from '../vendor/three/three.module.min.js';

export const D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const clamp01 = (x) => clamp(x, 0, 1);
/** An angle in (-pi, pi]: the short way round. */
export const wrapPi = (a) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};
/** smoothstep from a to b. */
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- curves (x 0..1 -> 0..1)
export const E = {
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  smoother: (x) => x * x * x * (x * (x * 6 - 15) + 10)
};
/** A damped spring that starts at rest (speed 0), scaled so x = 1 gives exactly 1. Overshoot ~ e^(-zeta pi / sqrt(1 - zeta^2)). */
export function springEase(zeta, omega) {
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const f = (x) => 1 - Math.exp(-zeta * omega * x) * (Math.cos(wd * x) + ((zeta * omega) / wd) * Math.sin(wd * x));
  const end = f(1);
  return (x) => (x >= 1 ? 1 : f(x) / end);
}
/** A slam: speeds up to the hit point `hit`, bounces back `rebound`, then sits (the "clack"). */
export const latchEase = (hit, rebound, power) => (x) => (x < hit ? (x / hit) ** power : 1 - rebound * Math.sin((Math.PI * (x - hit)) / (1 - hit)));
/** A power tailgate: the motor brings it down softly to `gap` short of shut, then the latch cinches it fast. */
export const cinchEase = (at, gap) => (x) => (x < at ? (1 - gap) * E.smoother(x / at) : 1 - gap + gap * E.outCubic((x - at) / (1 - at)));

/** Minimum-jerk path (5th order) from (p0, v0, a0) to p1 at rest in T seconds: position, speed and acceleration stay continuous. */
export class Quintic {
  constructor() { this.c = [0, 0, 0, 0, 0, 0]; this.T = 1; }
  set(p0, v0, a0, p1, T) {
    const d = p1 - p0, vT = v0 * T, aT = a0 * T * T, c = this.c;
    c[0] = p0; c[1] = vT; c[2] = aT / 2;
    c[3] = 10 * d - 6 * vT - 1.5 * aT;
    c[4] = -15 * d + 8 * vT + 1.5 * aT;
    c[5] = 6 * d - 3 * vT - 0.5 * aT;
    this.T = T;
  }
  p(s) { const c = this.c; return c[0] + s * (c[1] + s * (c[2] + s * (c[3] + s * (c[4] + s * c[5])))); }
  v(s) { const c = this.c; return (c[1] + s * (2 * c[2] + s * (3 * c[3] + s * (4 * c[4] + s * 5 * c[5])))) / this.T; }
  a(s) { const c = this.c; return (2 * c[2] + s * (6 * c[3] + s * (12 * c[4] + s * 20 * c[5]))) / (this.T * this.T); }
}

/** The bump 64 s^3 (1 - s)^3: 1 in the middle, speed and acceleration 0 at both ends, so it adds to a path smoothly. [b, b', b''] */
export function arcBump(s) {
  const u = s * (1 - s), u1 = 1 - 2 * s;
  return [64 * u * u * u, 192 * u * u * u1, 192 * (2 * u * u1 * u1 - 2 * u * u)];
}

// ---------------------------------------------------------------- the camera
/**
 * pose = {th, ph, r, tx, ty, tz}: theta, phi (radians), distance (m), the target point. limits = {phMin, phMax, rMin,
 * rMax}: what a finger can reach (RENDER's orbit limits).
 */
export class Rig {
  constructor(limits) {
    this.lim = limits;
    this.p = new Float64Array(6);
    this.v = new Float64Array(6);
    this.prev = new Float64Array(6);
    this.q = [0, 1, 2, 3, 4, 5].map(() => new Quintic());
    this.traj = null;
    this.goal = [0, 0, 5];
    this.iv = [0, 0];                 // fling speed of theta, phi (rad/s)
    this.viewKey = 'home';
    this.manual = false;              // the owner took the camera (a drag, a pinch, a flight stopped by a finger)
    this.reduced = false;             // prefers-reduced-motion: flights <= 0.45 s, no crane lift
    this.target = new THREE.Vector3();
  }

  jump(pose) {
    this.p.set([pose.th, pose.ph, pose.r, pose.tx, pose.ty, pose.tz]);
    this.v.fill(0);
    this.goal = [pose.th, pose.ph, pose.r];
    this.iv = [0, 0];
    this.traj = null;
  }

  /** Position, speed and acceleration now, the crane lift of a flight under way included. */
  sample(now) {
    if (this.traj) {
      const tr = this.traj, s = clamp01((now - tr.t0) / tr.T);
      const p = this.q.map((q) => q.p(s)), v = this.q.map((q) => q.v(s)), a = this.q.map((q) => q.a(s));
      if (tr.arc) {
        const [b, b1, b2] = arcBump(s);
        for (const [i, amp] of tr.arc) { p[i] += amp * b; v[i] += (amp * b1) / tr.T; a[i] += (amp * b2) / (tr.T * tr.T); }
      }
      return { p, v, a };
    }
    return { p: Array.from(this.p), v: Array.from(this.v), a: [0, 0, 0, 0, 0, 0] };
  }

  /** Fly to pose, carrying on from the current speed. Returns the flight time (s), 0 when already there. */
  flyTo(pose, now, T0) {
    const s = this.sample(now);
    const g = [s.p[0] + wrapPi(pose.th - s.p[0]), pose.ph, pose.r, pose.tx, pose.ty, pose.tz];
    const ang = Math.abs(g[0] - s.p[0]) + 1.2 * Math.abs(g[1] - s.p[1]);
    const dr = Math.abs(Math.log(g[2] / s.p[2])), dt = Math.hypot(g[3] - s.p[3], g[4] - s.p[4], g[5] - s.p[5]);
    const speed = Math.abs(s.v[0]) + Math.abs(s.v[1]) + 0.2 * Math.abs(s.v[2]);
    if (ang < 0.015 && dr < 0.01 && dt < 0.01 && speed < 0.02) return 0;
    let T = T0 || clamp(0.55 + 0.5 * ang + 0.6 * dr + 0.5 * dt, 0.6, 2.2);
    if (this.reduced) T = Math.min(T, 0.45);
    for (let i = 0; i < 6; i++) this.q[i].set(s.p[i], s.v[i], s.a[i], g[i], T);
    // A long turn (more than ~60 deg): mid-way the camera rises and backs off a little like a crane, then settles,
    // instead of sweeping close past the body.
    const k = this.reduced ? 0 : smooth(1.0, 2.6, Math.abs(g[0] - s.p[0]));
    const arc = k > 0 ? [[1, -0.16 * k], [2, 0.09 * k * g[2]]] : null;
    this.traj = { t0: now, T, arc };
    this.iv = [0, 0];
    this.manual = false;
    return T;
  }

  /** A finger caught the camera: stop the flight where it is (and any fling). True when a flight was under way. */
  grab() {
    const flying = !!this.traj;
    this.traj = null;
    this.goal = [this.p[0], this.p[1], this.p[2]];
    this.iv = [0, 0];
    return flying;
  }

  /** Advance to `now` (s); dt = this frame's length (s); held = a finger is down. Returns true while moving. */
  update(now, dt, held) {
    const p = this.p, v = this.v;
    this.prev.set(p);
    let moving = false;
    if (this.traj) {
      const tr = this.traj, s = clamp01((now - tr.t0) / tr.T);
      for (let i = 0; i < 6; i++) { p[i] = this.q[i].p(s); v[i] = this.q[i].v(s); }
      if (tr.arc) {
        const [b, b1] = arcBump(s);
        for (const [i, amp] of tr.arc) { p[i] += amp * b; v[i] += (amp * b1) / tr.T; }
      }
      if (s >= 1) { this.traj = null; v.fill(0); this.goal = [p[0], p[1], p[2]]; }
      moving = true;
    } else if (dt > 0) {
      const g = this.goal, iv = this.iv, lim = this.lim;
      if (!held && (iv[0] || iv[1])) {
        g[0] += iv[0] * dt;
        g[1] += iv[1] * dt;
        const k = Math.exp(-dt * 4.2);
        iv[0] *= k;
        iv[1] *= k;
        if (Math.abs(iv[0]) < 0.01 && Math.abs(iv[1]) < 0.01) iv[0] = iv[1] = 0;
      }
      g[1] = clamp(g[1], lim.phMin, lim.phMax);
      g[2] = clamp(g[2], lim.rMin, lim.rMax);
      // Smoothing in real time: the same feel at 60, 90 or 120 Hz.
      const k = 1 - Math.exp(-dt * 18);
      let d = 0;
      for (let i = 0; i < 3; i++) { p[i] += (g[i] - p[i]) * k; v[i] = (p[i] - this.prev[i]) / dt; d += Math.abs(g[i] - p[i]); }
      moving = d > 1e-4 || iv[0] !== 0 || iv[1] !== 0;
      if (!moving) for (let i = 0; i < 3; i++) { p[i] = g[i]; v[i] = 0; }
    }
    return moving;
  }

  apply(camera) {
    this.target.set(this.p[3], this.p[4], this.p[5]);
    camera.position.setFromSphericalCoords(this.p[2], this.p[1], this.p[0]).add(this.target);
    camera.lookAt(this.target);
  }
}

// ---------------------------------------------------------------- touch
/**
 * Orbit by touch or mouse, in place of OrbitControls: one finger turns (theta -= dx / W * pi * 1.15, phi -= dy / H *
 * pi * 0.5), two fingers zoom (r *= old spread / new spread), a quick release flings (the last 100 ms, only when the
 * last move is < 60 ms old and the window > 12 ms; at most 5 rad/s and 2.5 rad/s, x 0.5 on phi; braked e^(-4.2 dt)).
 * A pointercancel (the page took the swipe to scroll, touch-action pan-y) leaves no fling.
 * on = {size() -> {w, h} (CSS px), grab(flying), take(), change()}: take() = the owner moved the camera for the first
 * time in this gesture (or stopped a flight); change() = draw a frame.
 */
export class OrbitInput {
  constructor(canvas, rig, on) {
    this.canvas = canvas;
    this.rig = rig;
    this.on = on;
    this.active = false;
    this.pts = new Map();
    this.hist = [];
    this.pinch = 0;
    this.taken = false;
    const down = (e) => this.down(e);
    const move = (e) => this.move(e);
    const up = (e) => this.end(e, false);
    const cancel = (e) => this.end(e, true);
    const wheel = (e) => this.wheel(e);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    // Mouse wheel / trackpad pinch (which arrives as wheel + ctrlKey) zooms on
    // desktop, where there is no two-finger pinch. Non-passive so it can hold
    // the page still while zooming the car.
    canvas.addEventListener('wheel', wheel, { passive: false });
    // A capture lost without a pointerup here (the canvas left the page...): end that pointer, no fling. After a
    // normal pointerup or pointercancel the pointer is already gone and this does nothing.
    canvas.addEventListener('lostpointercapture', cancel);
    this.off = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('lostpointercapture', cancel);
    };
  }

  /** Wheel / trackpad-pinch zoom: scale the orbit distance (scroll up = zoom in). */
  wheel(e) {
    e.preventDefault();
    const rig = this.rig, lim = rig.lim;
    // deltaY > 0 (scroll down / pinch out) moves the camera back; clamp to the
    // orbit range. The exponential keeps each step proportional, so it feels the
    // same whether near or far.
    rig.goal[2] = clamp(rig.goal[2] * Math.exp(e.deltaY * 0.0012), lim.rMin, lim.rMax);
    this.take();
    this.on.change();
  }

  spread() {
    const a = Array.from(this.pts.values());
    return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  }

  take() {
    if (this.taken) return;
    this.taken = true;
    this.rig.manual = true;
    this.on.take();
  }

  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: still tracked */ }
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 1) {
      this.taken = false;
      this.hist.length = 0;
      if (this.rig.grab()) this.take();
    }
    if (this.pts.size === 2) this.pinch = this.spread();
    this.active = true;
    this.on.change();
  }

  move(e) {
    const pt = this.pts.get(e.pointerId);
    if (!pt) return;
    const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
    pt.x = e.clientX;
    pt.y = e.clientY;
    const rig = this.rig, lim = rig.lim, size = this.on.size();
    if (this.pts.size === 1) {
      if (!dx && !dy) return;
      rig.goal[0] -= (dx / size.w) * Math.PI * 1.15;
      rig.goal[1] = clamp(rig.goal[1] - (dy / size.h) * Math.PI * 0.5, lim.phMin, lim.phMax);
      const t = performance.now();
      this.hist.push([t, rig.goal[0], rig.goal[1]]);
      while (this.hist.length > 2 && t - this.hist[0][0] > 100) this.hist.shift();
      this.take();
    } else if (this.pts.size === 2) {
      const d = this.spread();
      if (this.pinch > 0 && d > 0 && d !== this.pinch) {
        rig.goal[2] = clamp(rig.goal[2] * (this.pinch / d), lim.rMin, lim.rMax);
        this.take();
      }
      this.pinch = d;
    }
    this.on.change();
  }

  end(e, cancelled) {
    if (!this.pts.has(e.pointerId)) return;
    this.pts.delete(e.pointerId);
    this.pinch = this.pts.size === 2 ? this.spread() : 0;
    if (this.pts.size) { this.hist.length = 0; return; }
    this.active = false;
    const h = this.hist, t = performance.now();
    if (!cancelled && h.length >= 2 && t - h[h.length - 1][0] < 60) {
      const a = h[0], b = h[h.length - 1], dt = (b[0] - a[0]) / 1000;
      if (dt > 0.012) {
        this.rig.iv[0] = clamp((b[1] - a[1]) / dt, -5, 5);
        this.rig.iv[1] = clamp(((b[2] - a[2]) / dt) * 0.5, -2.5, 2.5);
      }
    }
    this.on.change();
  }

  dispose() {
    this.off();
    this.pts.clear();
    this.active = false;
  }
}
