/*
 * neo/3d/chips.js: HTML pinned to the 3D car. OverDrive Neo (U4) adaptation of the fork's phone/3d/chips.js
 * (FA:phone/3d/chips.js, owner 2026-10-13, handoff-home-v2 B2, B3, C3; DS 3.2; SCREEN-MAP 3.3 H13-H16, 3.9).
 * Projected on every rendered frame (fractional translate3d); while nothing renders they stay.
 * - Warning labels, only for a problem: an open door, tailgate or hood ("<part> open", the live state) and a tyre the
 *   car flags (tyres.<w>.warn = state warn or alert; the pressure in the car's unit, fmt.pressure). A node + offset
 *   (m) + outward normal: faded out when the part looks away (facing <= -0.25, tyres -0.2), off screen (|ndc| >= 1.1)
 *   or behind the camera; the centre kept >= half its width + 6 px inside the hero (width measured once shown).
 * - One lock icon: the lock aggregate (lock.js) of what the car shows (the director's shown, so it turns with the
 *   lock / unlock shot), at the handle anchor (model.js, in the door's frame) of the front door facing the camera
 *   (> 0.12; one at a time). Locked / unlocked / "?" (unknown, never a guess). A change pops 0.6 -> 1.18 -> 1 in 0.5 s
 *   on the inner disc (the outer one is placed by transform).
 * - Charging: "6.6 kW . 64 -> 90 %" near the charge port, only when the kW may show (charge.kwShown: charging, kW > 0,
 *   not the car's nominal placeholder; "~" when estimated, DS 16.4 row 14); first free place that touches no shown
 *   label or lock icon, not the chips column and not the hero's bottom band; with no free place it hides.
 * Changes from the fork: Neo class names (neo-hero-*), the Neo kW rule and pressure unit, env.fmt = Neo fmt.
 */
import * as THREE from '../vendor/three/three.module.min.js';
import { lockAgg } from '../lock.js';

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
/** CSS px: label edge to the port, margin to the hero's edges and between badges, the hero's bottom band. */
export const LAYOUT = { gap: 18, pad: 6, foot: 52, step: 8 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));
/** Rectangles {l, t, r, b} closer than `pad` px. */
const touches = (a, o, pad) => a.l < o.r + pad && o.l < a.r + pad && a.t < o.b + pad && o.t < a.b + pad;
const up1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ARROW = String.fromCharCode(0x2192);
const MID = String.fromCharCode(0xb7);
// Warning labels (reference home-v2.html 349-359): [door, node, offset in the car's frame (m), outward normal].
export const PARTS = [['lf', 'door_FL', [1.15, 0.25, 0.1], [1, 0, 0]], ['rf', 'door_FR', [-1.15, 0.25, 0.1], [-1, 0, 0]],
  ['lr', 'door_RL', [1.15, 0.25, 0.1], [1, 0, 0]], ['rr', 'door_RR', [-1.15, 0.25, 0.1], [-1, 0, 0]],
  ['trunk', 'tailgate', [0, 0.25, -0.9], [0, 0, -1]], ['hood', 'hood', [0, 0.35, 0.5], [0, 0, 1]]];
export const TYRES = [['fl', 'wheel_FL', 1], ['fr', 'wheel_FR', -1], ['rl', 'wheel_RL', 1], ['rr', 'wheel_RR', -1]];
const FLIP = [{ transform: 'scale(.6)' }, { transform: 'scale(1.18)', offset: 0.55 }, { transform: 'scale(1)' }];
const FLIP_TIMING = { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' };
export const PIN_MIN = -0.25;
export const TYRE_MIN = -0.2;
export const LOCK_MIN = 0.12;

/**
 * The text of the kW label from the live state, or null when it must not show (exported for tests, HT1/HT2):
 * "<~>6,6 kW . 64->90%"; the target part only with a target, the % part only with a known SoC.
 */
export function kwLabel(read, fmt, isNum) {
  if (read('charge.kwShown') !== true) return null;
  const kw = read('charge.kw');
  if (!isNum(kw) || !(kw > 0)) return null;
  const bits = [`${read('charge.est') === true ? '~' : ''}${fmt.kw(kw)}`];
  const soc = read('energy.socPct');
  const target = read('charge.targetPct');
  if (isNum(soc)) bits.push(`${fmt.num(Math.round(soc))}${isNum(target) ? `${ARROW}${fmt.num(target)}` : ''}%`);
  return bits.join(` ${MID} `);
}

/** A tyre pin's text (H14): the pressure in the car's unit, or the generic warning without a reading. */
export function tyreText(read, w, env) {
  const p = read(`tyres.${w}.kPa`);
  return env.isNum(p) ? env.fmt.pressure(p) : env.t('ph.home.pin_tyre');
}

export class Badges {
  /** env = {h, t, icon, isNum, fmt (Neo fmt: num, kw, pressure)}; layer = the labels layer; car = model.prepareCar(). */
  constructor(env, layer, car) {
    this.od = env;
    this.car = car;
    this.layer = layer;
    this.items = new Map();   // key -> {el, want, kind, w, h, min, anchor | node + offset + normal, part | tyre | lock | lift}
    this.keepOut = [];        // the chips column (and the loading pill), in the layer's px
    this.dirty = true;        // re-measure keepOut at the next place()
    this.lockState = undefined;
    this.still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const n = (name) => car.nodes.get(name);
    for (const [k, node, offset, normal] of PARTS) this.add(`pin_${k}`, 'neo-hero-pin', { node: n(node), offset, normal, min: PIN_MIN, part: k });
    for (const [k, node, s] of TYRES) this.add(`tyre_${k}`, 'neo-hero-pin.neo-hero-pin-tyre', { node: n(node), offset: [s * 0.35, 0.5, 0], normal: [s, 0, 0], min: TYRE_MIN, tyre: k });
    for (const id of ['FL', 'FR']) this.add(`lock_${id}`, 'neo-hero-lockb', { anchor: car.anchors[`door_${id}`], min: LOCK_MIN, lock: true, want: true });
    this.add('charge', 'neo-hero-badge.neo-hero-badge-kw', { anchor: car.anchors.charge, min: 0.12, lift: true });
  }

  add(key, cls, spec) {
    if (!spec.anchor && !spec.node) return;
    const el = this.od.h(`div.${cls}`, { attrs: { 'aria-hidden': 'true' } });
    el.hidden = true;
    const it = Object.assign({ el, want: false, kind: '', w: 0, h: 0 }, spec);
    if (spec.lock) el.appendChild(it.box = this.od.h('span.neo-hero-lockb-in'));
    this.layer.appendChild(el);
    this.items.set(key, it);
  }

  /** The hero's own HTML the label must not cover; measured once per state change or resize, not per frame. */
  measure() {
    this.dirty = false;
    this.keepOut = [];
    const hero = this.layer.closest('.neo-hero') || this.layer.closest('.neo-hero-stage');
    if (!hero) return;
    const base = this.layer.getBoundingClientRect();
    for (const el of hero.querySelectorAll('.neo-hero-chips, .neo-hero-busy')) {
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this.keepOut.push({ l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top });
    }
  }

  /** The badge's size in CSS px (measured once while shown, again after its text changed). */
  size(it) {
    if (!it.w) {
      it.w = it.el.offsetWidth;
      it.h = it.el.offsetHeight;
    }
    return it;
  }

  /** The warning labels and the kW label from the live state (cheap; called on every relevant change). */
  update(read) {
    this.dirty = true;        // Home's chips were just redrawn for the same change
    const od = this.od;
    const t = od.t;
    for (const it of this.items.values()) {
      let text = null;
      if (it.part) {
        it.want = read(`doors.${it.part}`) === true;
        if (it.want) text = t('ph.home.pin_open', { p: up1(t(`part.${it.part}`)) });
      } else if (it.tyre) {
        it.want = read(`tyres.${it.tyre}.warn`) === true;
        if (it.want) text = tyreText(read, it.tyre, od);
      } else if (it.lift) {
        text = kwLabel(read, od.fmt, od.isNum);
        it.want = text !== null;
      }
      if (text === null || it.kind === text) continue;
      it.kind = text;
      it.w = 0;
      it.el.textContent = '';
      it.el.appendChild(od.icon(it.part ? 'alert' : it.tyre ? 'tyre' : 'bolt', it.lift ? 'neo-hero-badge-ico' : ''));
      it.el.appendChild(od.h('span', { text }));
    }
  }

  /**
   * The lock icon: the aggregate of what the car shows (read = the director's get), after every drawn frame (car3d.js
   * onFrame); nothing to do while it stays the same.
   */
  paintLock(read) {
    const v = lockAgg(read).state;
    if (v === this.lockState) return;
    const flip = this.lockState !== undefined && !this.still;
    this.lockState = v;
    for (const it of this.items.values()) {
      if (!it.lock) continue;
      it.el.setAttribute('data-state', v === true ? 'locked' : v === false ? 'unlocked' : 'unknown');
      it.box.textContent = v == null ? '?' : '';
      if (v != null) it.box.appendChild(this.od.icon(v ? 'lock' : 'unlock'));
      if (flip && it.box.animate) it.box.animate(FLIP, FLIP_TIMING);
    }
  }

  /** _p = the item's point (world); returns its facing: outward normal . direction to the camera (_c). */
  facing(it) {
    const a = it.anchor;
    if (a) {
      a.node.localToWorld(_p.copy(a.local));
      _n.copy(a.normal);
      if (a.normalLocal) _n.transformDirection(a.node.matrixWorld);
    } else {
      it.node.getWorldPosition(_p).add(_d.fromArray(it.offset));
      _n.fromArray(it.normal);
    }
    return _n.dot(_d.copy(_c).sub(_p).normalize());
  }

  /** A label or the lock icon at (x, y): kept inside the hero, faded out (still followed) while its part looks away. */
  pin(it, x, y, on, w, h, taken) {
    if (it.el.hidden) it.el.hidden = false;
    const o = on ? '' : '0';
    if (it.el.style.opacity !== o) it.el.style.opacity = o;
    const s = this.size(it);
    const l = clamp(x, s.w / 2 + 6, w - s.w / 2 - 6) - s.w / 2;
    const t = clamp(y, s.h / 2 + 6, h - s.h / 2 - 6) - s.h / 2;
    this.put(it, l, t);
    if (on) taken.push({ l, t, r: l + s.w, b: t + s.h });
  }

  /** Project every wanted item for this camera; w, h = the canvas size in CSS px (= the labels layer). */
  place(camera, w, h) {
    if (this.dirty) this.measure();
    camera.getWorldPosition(_c);
    const taken = this.keepOut.slice();
    const locks = [];
    let label = null;
    for (const it of this.items.values()) {
      if (!it.want) {
        if (!it.el.hidden) it.el.hidden = true;
        continue;
      }
      const f = this.facing(it);
      _p.project(camera);
      const lim = it.lift ? 1.05 : 1.1;
      const on = f > it.min && _p.z < 1 && Math.abs(_p.x) < lim && Math.abs(_p.y) < lim;
      const x = ((_p.x + 1) / 2) * w;
      const y = ((1 - _p.y) / 2) * h;
      if (it.lift) {
        it.el.hidden = !on;
        if (on) label = { it, x, y };     // placed once every label and the lock icon are down
      } else if (it.lock) locks.push({ it, x, y, on, f });
      else this.pin(it, x, y, on, w, h, taken);
    }
    // One lock icon: the front door that faces the camera most (with both front doors open, both could face it).
    let top = null;
    for (const k of locks) if (k.on && (!top || k.f > top.f)) top = k;
    for (const k of locks) this.pin(k.it, k.x, k.y, k === top, w, h, taken);
    if (label) this.placeLabel(label.it, label.x, label.y, taken, w, h);
  }

  /** The kW label: the first free place near the port (x, y), inside the hero and above its bottom band. */
  placeLabel(it, x, y, taken, w, h) {
    const { gap, pad, foot, step } = LAYOUT;
    const s = this.size(it);
    // The port's LED stays visible too.
    taken.push({ l: x - 8, t: y - 8, r: x + 8, b: y + 8 });
    const above = y - gap - s.h;
    const below = y + gap;
    const tries = [[x - s.w / 2, above], [x - s.w / 2, below], [x - gap - s.w, y - s.h / 2], [x + gap, y - s.h / 2]];
    for (let k = 1; k * step < h; k++) tries.push([x - s.w / 2, above - k * step], [x - s.w / 2, below + k * step]);
    for (const [l0, t0] of tries) {
      const l = clamp(l0, pad, w - pad - s.w);
      const t = clamp(t0, pad, h - foot - s.h);
      const box = { l, t, r: l + s.w, b: t + s.h };
      if (!taken.some((o) => touches(box, o, pad))) {
        this.put(it, l, t);
        return;
      }
    }
    it.el.hidden = true;
  }

  /** Fractional px, no rounding: a badge glides with the camera instead of stepping one pixel at a time. */
  put(it, l, t) {
    it.el.style.transform = `translate3d(${l}px, ${t}px, 0)`;
  }

  destroy() {
    for (const it of this.items.values()) if (it.el.parentNode) it.el.parentNode.removeChild(it.el);
    this.items.clear();
  }
}
