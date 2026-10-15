/*
 * phone/3d/director.js: the hero's action director (owner 2026-10-13, E:\OverDrive\ui-concepts\handoff-3d-motion).
 * Every change of a watched path (doors, windows, lock, power, gear, lights, A/C, charging, mirrors) becomes a shot:
 * the camera flies to that part's view, then the part plays its own motion. Pure state reading, like mapping.js: the
 * 3D code sends nothing to the car.
 *
 * - `read` = od.store.get (or the demo); `shown` = the watched paths as the 3D car plays them now. Mapping reads
 *   `get` (shown for a watched path, read for the rest), so kW, %, paint apply at once and never make a shot.
 * - update(now) compares every watched path with what it saw last (no changed-list: the demo has none); changes
 *   within 90 ms make one batch; classify() gives each its view, priority, caption and effect (handoff D3).
 * - build(): minor items ride on a host shot (lock / unlock / start / stop) without a caption of their own; doors at
 *   different views become doorsL / doorsR / doorsAll, windows winAll; same view = one shot; order: shots without a
 *   camera first, then priority, then the nearest view (the camera does not go round in circles).
 * - Queue: a shot at the view of the playing one joins it (plays now), at the view of a waiting one joins that one;
 *   more than 3 waiting become one overview shot; a shot whose paths are all back to shown, with no effect, is dropped.
 * - Start: without a finger down the camera flies (T = rig.flyTo) and the parts play at T x lead (0.6, start 0.7);
 *   with a finger down they play at once and the camera stays. End: max(0.55, min(busy, cap) x k) + 0.15 s, k = 0.6
 *   with more waiting, else 0.85. 3.2 s after the last shot the camera returns to restView(); at rest it follows a
 *   restView() that changes without a shot (null -> value, V2L), unless the owner took the camera. Several parts
 *   open: their mean direction (openView, handoff-home-v2 B2), not a fixed overview.
 * - Caption labels are i18n descriptors, never text: {k: 'ph.act.<key>', p?: part id (PART_KEY), n?: count, g?: gear};
 *   captionText() turns them into the catalog's words; caption(label[], icon, holdS) and pop(kind) go to car3d.js,
 *   which hands the text to hero.js.
 * - A change from or to null (unknown) is not an action: it applies at once, quietly (no camera, caption or effect).
 */
import { D2R, wrapPi, clamp } from './motion.js';
import { blinkPattern, holdPattern } from './mapping.js';

/** Views: az / el in degrees (az 0 = nose, +90 = left side, the driver's on LHD), zoom x the fit distance, focus / mix =
 * the target moved toward that part's centre, lift = target raised (m). */
export const VIEWS = {
  home: { az: 39, el: 15 }, overview: { az: 32, el: 24, zoom: 1.04 },
  doorFL: { az: 56, el: 13, zoom: 0.97, focus: 'door_FL', mix: 0.25 }, doorRL: { az: 112, el: 14, zoom: 0.97, focus: 'door_RL', mix: 0.25 },
  doorFR: { az: -56, el: 13, zoom: 0.97, focus: 'door_FR', mix: 0.25 }, doorRR: { az: -112, el: 14, zoom: 0.97, focus: 'door_RR', mix: 0.25 },
  doorsL: { az: 84, el: 16 }, doorsR: { az: -84, el: 16 }, doorsAll: { az: 0, el: 30, zoom: 1.02 },
  hood: { az: 24, el: 30, zoom: 0.95, focus: 'hood', mix: 0.3 }, trunk: { az: 146, el: 20, focus: 'tailgate', mix: 0.2 },
  fuel: { az: 118, el: 12, zoom: 0.62, focus: 'flap_fuel', mix: 0.65 }, charge: { az: -118, el: 12, zoom: 0.62, focus: 'flap_charge', mix: 0.65 },
  chargeRest: { az: -138, el: 16 },
  winL: { az: 84, el: 10, zoom: 0.96 }, winR: { az: -84, el: 10, zoom: 0.96 }, winAll: { az: 38, el: 12 }, roof: { az: 30, el: 54, zoom: 0.96 },
  mirrors: { az: 16, el: 16, zoom: 0.9 }, lock: { az: 36, el: 24, zoom: 1.06 }, unlock: { az: 30, el: 16, zoom: 1.02 },
  start: { az: 22, el: 7, zoom: 1.12, dolly: { zoom: 0.94, s: 2.6 }, lead: 0.7 }, stop: { az: 39, el: 15 },
  lightsF: { az: 12, el: 8 }, turnL: { az: 34, el: 12 }, turnR: { az: -34, el: 12 }, hazard: { az: 162, el: 14 },
  reverse: { az: 174, el: 12 }, ac: { az: 10, el: 30, zoom: 0.84, lift: 0.12 }, flash: { az: 8, el: 10, zoom: 1.04 }
};

/** Several parts open (handoff-home-v2 B2, car-engine.js restView): from the circular mean of their views' az, higher
 * and wider (el 24, zoom 1.24), so every warning label stays in view; the view key carries the az ('open:-163'). */
export const OPEN = { el: 24, zoom: 1.24 };
export function openView(keys) {
  let x = 0, z = 0;
  for (const k of keys) { const a = VIEWS[k].az * D2R; x += Math.sin(a); z += Math.cos(a); }
  return `open:${Math.round(Math.hypot(x, z) < 0.2 ? VIEWS.overview.az : Math.atan2(x, z) / D2R)}`;
}
const viewOf = (key) => {
  const m = /^open:(-?\d+)$/.exec(key);
  return m ? { az: Number(m[1]), el: OPEN.el, zoom: OPEN.zoom } : VIEWS[key] || VIEWS.home;
};

/**
 * The camera pose of a view. f = {fit(th, ph, target) -> the distance that frames the whole car, base (the orbit
 * target, a Vector3), centers (model.js part centres), rMin, rMax, dirs: {key: [x, y, z]} for views that are an exact
 * direction (home = RENDER.view, chargeRest = RENDER.chargeView)}. zoom overrides the view's own.
 */
export function viewPose(key, zoom, f) {
  const V = viewOf(key);
  let th = V.az * D2R;
  let ph = (90 - V.el) * D2R;
  const dir = f.dirs && f.dirs[key];
  if (dir) {
    th = Math.atan2(dir[0], dir[2]);
    ph = Math.acos(dir[1] / Math.hypot(dir[0], dir[1], dir[2]));
  }
  const r = f.fit(th, ph, f.base) * (zoom != null ? zoom : V.zoom || 1);
  const t = f.base.clone();
  if (V.focus && f.centers && f.centers[V.focus]) t.lerp(f.centers[V.focus], V.mix || 0);
  t.y += V.lift || 0;
  return { th, ph, r: clamp(r, f.rMin, f.rMax), tx: t.x, ty: t.y, tz: t.z };
}

// lock.doors.* (owner 2026-10-13, handoff-home-v2 B3): the lock icon reads what the car shows, so the four doors' locks
// ride on the lock / unlock shot (minor) and apply at once without one.
export const WATCH = /^(doors\.(lf|rf|lr|rr|hood|trunk|fuel)|windows\.(lf|rf|lr|rr|sunroof|shade)|lock\.driver|lock\.doors\.(lf|rf|lr|rr)|power\.(level|acc|gear)|lights\.(low|high|turnL|turnR|hazard)|climate\.on|charge\.(plugged|active)|mirrors\.folded)$/;
/** WATCH as a list (30 paths). */
export const PATHS = [].concat(
  ['lf', 'rf', 'lr', 'rr', 'hood', 'trunk', 'fuel'].map((k) => `doors.${k}`),
  ['lf', 'rf', 'lr', 'rr', 'sunroof', 'shade'].map((k) => `windows.${k}`),
  ['lock.driver'], ['lf', 'rf', 'lr', 'rr'].map((k) => `lock.doors.${k}`), ['power.level', 'power.acc', 'power.gear'],
  ['low', 'high', 'turnL', 'turnR', 'hazard'].map((k) => `lights.${k}`),
  ['climate.on', 'charge.plugged', 'charge.active', 'mirrors.folded']);

export const BATCH_S = 0.09;
export const REST_DELAY = 3.2;
const norm = (v) => (v === undefined ? null : v);

/** A caption descriptor: ph.act.<a>, with a part id (ph.act.part.<p>) and extras ({n}, {g}). */
const L = (a, p, x) => Object.assign({ k: `ph.act.${a}` }, p ? { p } : null, x || null);
// [view suffix, part id, side]
const DOORS = { lf: ['FL', 'door_fl', 'L'], rf: ['FR', 'door_fr', 'R'], lr: ['RL', 'door_rl', 'L'], rr: ['RR', 'door_rr', 'R'] };
const WINS = { lf: ['L', 'win_fl'], rf: ['R', 'win_fr'], lr: ['L', 'win_rl'], rr: ['R', 'win_rr'] };

/**
 * One change -> one action {view, label, icon, prio, cap?, host?, fx?, minor?, group?, side?, open?}; view null = no
 * camera. minor = rides on a host shot of the same batch (mirrors with the lock...). read = the live state.
 */
export function classify(k, from, to, read) {
  if (from == null || to == null) return { view: null, quiet: true, label: null, icon: null, prio: 5 };
  const [ns, id] = k.split('.');
  if (ns === 'doors') {
    const d = DOORS[id];
    if (d) return { view: `door${d[0]}`, group: 'door', side: d[2], open: to === true, label: L(to ? 'open' : 'close', d[1]), icon: 'door', prio: 3 };
    if (id === 'hood') return { view: 'hood', label: L(to ? 'open' : 'close', 'hood'), icon: 'hood', prio: 3 };
    if (id === 'trunk') return { view: 'trunk', label: L(to ? 'open' : 'close', 'trunk'), icon: 'trunk', prio: 3, cap: 2.4 };
    if (id === 'fuel') return { view: 'fuel', label: L(to ? 'open' : 'close', 'fuel'), icon: 'fuel', prio: 3 };
  }
  if (ns === 'windows') {
    const down = (to || 0) > (from || 0), w = WINS[id];
    if (w) return { view: `win${w[0]}`, group: 'win', label: L(down ? 'win_down' : 'win_up', w[1]), icon: 'window', prio: 4 };
    return { view: 'roof', label: L(down ? 'open' : 'close', id === 'sunroof' ? 'sunroof' : 'shade'), icon: 'roof', prio: 4, cap: 2.6 };
  }
  if (k === 'lock.driver') {
    return to === true ? { view: 'lock', host: true, fx: 'lock', label: L('locked'), icon: 'lock', prio: 1 }
      : { view: 'unlock', host: true, fx: 'unlock', label: L('unlocked'), icon: 'unlock', prio: 1 };
  }
  if (k === 'power.level') {
    if (to === 2) return { view: 'start', host: true, fx: 'start', label: L('start'), icon: 'power', prio: 0, cap: 2.6 };
    if (from === 2) return { view: 'stop', host: true, fx: 'stop', label: L('stop'), icon: 'power', prio: 0 };
    return { view: null, label: L(to === 1 ? 'acc_on' : 'acc_off'), icon: 'power', prio: 2 };
  }
  if (k === 'power.acc') return { view: null, minor: true, label: null, icon: 'power', prio: 5 };
  if (ns === 'lock') return { view: null, minor: true, label: null, icon: 'lock', prio: 5 };    // lock.doors.*
  if (k === 'power.gear') {
    return to === 'R' ? { view: 'reverse', label: L('reverse'), icon: 'reverse', prio: 2 }
      : { view: null, minor: true, label: L('gear', null, { g: String(to) }), icon: 'reverse', prio: 2 };
  }
  if (k === 'mirrors.folded') return { view: 'mirrors', minor: true, label: L(to ? 'mirror_fold' : 'mirror_unfold'), icon: 'mirror', prio: 4 };
  if (ns === 'lights') {
    const on = to === true;
    const view = !on ? null : id === 'turnL' ? 'turnL' : id === 'turnR' ? 'turnR' : id === 'hazard' ? 'hazard' : 'lightsF';
    return { view, minor: !on, label: L(on ? 'on' : 'off', id), icon: 'light', prio: 2, cap: id === 'low' || id === 'high' ? 1.2 : 1.9 };
  }
  if (k === 'climate.on') return { view: to ? 'ac' : null, minor: !to, label: L(to ? 'ac_on' : 'ac_off'), icon: 'fan', prio: 3, cap: 2 };
  if (ns === 'charge') {
    const plugged = read('charge.plugged') === true, act = read('charge.active') === true;
    return { view: 'charge', label: L(act ? 'charge_start' : plugged ? (k === 'charge.active' ? 'charge_stop' : 'plugged') : 'unplugged'), icon: 'bolt', prio: 2, cap: 2.2 };
  }
  return { view: null, quiet: true, label: null, icon: null, prio: 5 };
}

/**
 * The part names of the captions come from the catalogs Home already has (part.*, win.*, lights.*: the base catalog);
 * the shade has its own ph.act.part.shade (veh.shade sits in the vehicle catalog, not loaded on Home).
 */
export const PART_KEY = {
  door_fl: 'part.lf', door_fr: 'part.rf', door_rl: 'part.lr', door_rr: 'part.rr', hood: 'part.hood', trunk: 'part.trunk',
  fuel: 'part.fuel', win_fl: 'win.lf', win_fr: 'win.rf', win_rl: 'win.lr', win_rr: 'win.rr', sunroof: 'win.sunroof',
  shade: 'ph.act.part.shade', low: 'lights.low', high: 'lights.high', turnL: 'lights.turnL', turnR: 'lights.turnR',
  hazard: 'lights.hazard'
};
const up1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/**
 * A caption as text: each descriptor through the catalog (t = od.t; "{p} opened" gets its first letter up), joined
 * with a middle dot. No word of it is written here.
 */
export function captionText(label, t) {
  return (label || []).map((l) => {
    const x = {};
    if (l.p) x.p = t(PART_KEY[l.p] || `ph.act.part.${l.p}`);
    if (l.n != null) x.n = l.n;
    if (l.g != null) x.g = l.g;
    return up1(t(l.k, x));
  }).join(' \u00b7 ');
}

const labelId = (l) => `${l.k}|${l.p || ''}|${l.n == null ? '' : l.n}|${l.g || ''}`;
/** The caption of a shot from its actions (each part keeps its latest): at most two, or the first and "+N". */
export function labelOf(s) {
  const its = Array.from(s.items.values()).filter((i) => !i.riding && i.label);
  const doors = its.filter((i) => i.group === 'door');
  const out = [];
  if (doors.length > 1) {
    const o = doors.every((d) => d.open), c = doors.every((d) => !d.open);
    out.push(L(o ? 'doors_open' : c ? 'doors_close' : 'doors_mixed', null, { n: doors.length }));
  }
  for (const i of its) {
    if (doors.length > 1 && i.group === 'door') continue;
    if (i.k === 'windows.shade' && s.items.has('windows.sunroof')) continue;   // the shade with the sunroof: one line
    out.push(i.label);
  }
  const seen = new Set();
  const u = out.filter((l) => { const id = labelId(l); if (seen.has(id)) return false; seen.add(id); return true; });
  return u.length > 2 ? [u[0], L('more', null, { n: u.length - 1 })] : u;
}

export function mergeShot(a, b) {
  for (const k of b.paths) a.paths.add(k);
  for (const [k, it] of b.items) { a.items.delete(k); a.items.set(k, it); }   // same part: the latest action wins
  for (const f of b.fx) if (!a.fx.includes(f)) a.fx.push(f);
  if (b.items.size) a.icon = b.icon;
  a.cap = Math.max(a.cap, b.cap);
  a.prio = Math.min(a.prio, b.prio);
  a.label = labelOf(a);
}

export class Director {
  /**
   * o = {read(path), rig (motion.js Rig), pose(key, zoom) -> pose, held() -> a finger is down, reduced,
   * caption(label, icon, holdS), pop(kind, now)}; set .mapping before the first update().
   */
  constructor(o) {
    this.o = o;
    this.read = o.read;
    this.rig = o.rig;
    this.mapping = null;
    this.reduced = !!o.reduced;
    this.shown = {};
    this.seen = {};
    for (const k of PATHS) this.shown[k] = this.seen[k] = norm(o.read(k));
    this.queue = [];
    this.cur = null;
    this.batch = new Set();
    this.batchAt = null;
    this.restAt = null;
    this.wantRest = false;
    // What the 3D car draws: shown for a watched path, the live value for the rest.
    this.get = (p) => {
      const v = this.shown[p];
      return v !== undefined ? v : this.read(p);
    };
  }

  /** Note every watched path that changed since the last look (no changed-list needed). */
  scan(now) {
    for (const k of PATHS) {
      const v = norm(this.read(k));
      if (v === this.seen[k]) continue;
      this.seen[k] = v;
      this.batch.add(k);
      if (this.batchAt == null) this.batchAt = now;
    }
  }

  flush(now) {
    const items = [];
    for (const k of this.batch) {
      const to = norm(this.read(k)), from = this.shown[k];
      if (to === from && !this.inFlight(k)) continue;
      items.push(Object.assign({ k }, classify(k, from, to, this.read)));
    }
    this.batch.clear();
    this.batchAt = null;
    for (const s of this.build(items)) this.enqueue(s, now);
  }

  inFlight(k) { return (this.cur && this.cur.paths.has(k)) || this.queue.some((s) => s.paths.has(k)); }

  build(items) {
    const host = items.find((i) => i.host);
    const doorIt = items.filter((i) => i.group === 'door'), winIt = items.filter((i) => i.group === 'win');
    const doorViews = new Set(doorIt.map((i) => i.view)), doorSides = new Set(doorIt.map((i) => i.side)), winViews = new Set(winIt.map((i) => i.view));
    const by = new Map(), out = [];
    for (const it of items) {
      let view = it.view;
      const riding = it.minor && host;
      if (riding) view = host.view;
      else if (it.group === 'door' && doorViews.size > 1) view = doorSides.size > 1 ? 'doorsAll' : `doors${it.side}`;
      else if (it.group === 'win' && winViews.size > 1) view = 'winAll';
      const key = view || 'now';
      let s = by.get(key);
      if (!s) {
        s = { view, items: new Map(), icon: it.icon, paths: new Set(), fx: [], prio: it.prio, cap: 0 };
        by.set(key, s);
        out.push(s);
      }
      if (it.host) s.icon = it.icon;
      s.items.set(it.k, Object.assign({}, it, { riding: !!riding }));
      s.paths.add(it.k);
      if (it.fx && !s.fx.includes(it.fx)) s.fx.push(it.fx);
      s.prio = Math.min(s.prio, it.prio);
      s.cap = Math.max(s.cap, it.cap || 1.6);
    }
    for (const s of out) s.label = labelOf(s);
    // Order: shots without a camera, then priority (lock / power first), then within one priority the nearest view
    // from where the camera is going.
    const now = out.filter((s) => !s.view), rest = out.filter((s) => s.view).sort((a, b) => a.prio - b.prio);
    const order = [];
    const rig = this.rig;
    let th = rig.traj ? rig.q[0].p(1) : rig.p[0];
    while (rest.length) {
      const prio = rest[0].prio;
      let best = 0, bestD = Infinity;
      rest.forEach((s, i) => {
        if (s.prio !== prio) return;
        const d = Math.abs(wrapPi(VIEWS[s.view].az * D2R - th));
        if (d < bestD) { bestD = d; best = i; }
      });
      const s = rest.splice(best, 1)[0];
      th = VIEWS[s.view].az * D2R;
      order.push(s);
    }
    return now.concat(order);
  }

  enqueue(s, now) {
    if (!s.view) {
      this.play(s, now);
      this.caption(s, Math.max(1.6, this.mapping.busyFor(now) + 0.8));
      return;
    }
    const c = this.cur;
    if (c && c.view === s.view) {
      mergeShot(c, s);
      if (c.played) this.play(s, now, c);
      this.caption(c);
      return;
    }
    const q = this.queue.find((x) => x.view === s.view);
    if (q) { mergeShot(q, s); return; }
    this.queue.push(s);
    // Too many shots waiting: one overview shot of them all, instead of a long wait.
    if (this.queue.length > 3) {
      const all = this.queue.splice(0);
      const o = { view: 'overview', items: new Map(), icon: all[0].icon, paths: new Set(), fx: [], prio: 9, cap: 0 };
      for (const x of all) mergeShot(o, x);
      o.label = [L('many', null, { n: o.items.size })];
      this.queue.push(o);
    }
  }

  stale(s) { return !s.fx.length && Array.from(s.paths).every((k) => this.shown[k] === norm(this.read(k))); }

  start(s, now) {
    this.restAt = null;
    if (this.stale(s)) return false;          // back to what the car shows before its turn: dropped
    this.cur = s;
    let T = 0;
    if (!this.o.held()) {
      T = this.rig.flyTo(this.o.pose(s.view), now);
      this.rig.viewKey = s.view;
    }
    s.playAt = now + (T < 0.3 ? 0 : T * ((VIEWS[s.view] && VIEWS[s.view].lead) || 0.6));
    this.caption(s, T + 3.2);
    return true;
  }

  play(s, now, host) {
    let changed = false;
    for (const k of s.paths) {
      const v = norm(this.read(k));
      if (this.shown[k] !== v) { this.shown[k] = v; changed = true; }
    }
    s.played = true;
    if (!changed && !s.fx.length) { s.endAt = now; return; }
    const m = this.mapping;
    m.sync(now);
    for (const f of s.fx) this.fx(f, now);
    const V = VIEWS[s.view];
    if (V && V.dolly && !this.reduced && !this.o.held()) this.rig.flyTo(this.o.pose(s.view, V.dolly.zoom), now, V.dolly.s);
    const len = Math.min(m.busyFor(now), s.cap || 1.6);
    const owner = host || s;
    // More shots waiting: leave earlier (the parts finish while the camera flies to the next one).
    const k = this.queue.length ? 0.6 : 0.85;
    owner.endAt = Math.max(owner.endAt || 0, now + Math.max(0.55, len * k) + 0.15);
    if (owner.view) {
      this.wantRest = true;
      this.caption(owner, owner.endAt - now + 1.1);
    }
  }

  /** The effects of a shot (handoff D4), from the moment it plays. */
  fx(name, now) {
    const m = this.mapping;
    if (name === 'lock') {
      m.addLampFx(['turnL', 'turnR'], now + 0.05, 0.6, blinkPattern(1, 0.6, 0.62));
      m.ripple(now + 0.05, 0x4FE0C1);
      this.o.pop('lock', now);
    } else if (name === 'unlock') {
      m.addLampFx(['turnL', 'turnR'], now + 0.05, 1.0, blinkPattern(2, 0.5, 0.55));
      m.ripple(now + 0.05, 0xFFD08A);
      this.o.pop('unlock', now);
      // Welcome lights when the car is not READY.
      if (this.shown['power.level'] !== 2) {
        m.addLampFx(['drl'], now + 0.15, 3.3, holdPattern(0.45, 2.1, 0.75));
        m.addLampFx(['low'], now + 0.3, 2.6, holdPattern(0.35, 1.5, 0.75));
      }
    } else if (name === 'start') {
      m.ripple(now + 0.1, 0x5AE6FF);
      m.ripple(now + 0.5, 0x5AE6FF);
      m.addLampFx(['tail'], now + 0.25, 2.4, holdPattern(0.35, 1.2, 0.85));
      this.o.pop('power', now);
    } else if (name === 'flash') {
      m.addLampFx(['turnL', 'turnR'], now, 2.0, blinkPattern(3, 2 / 3, 0.5));
      m.addLampFx(['low', 'high'], now + 0.02, 1.3, blinkPattern(2, 0.65, 0.45));
      m.ripple(now, 0xFFFFFF);
    }
    // stop: nothing more (the lamps and the halo fade with the state).
  }

  caption(s, holdS) {
    if (!s.label || !s.label.length) return;
    this.o.caption(s.label, s.icon, holdS);
  }

  /** Once per frame, first: batches, shots, the return to the rest view. */
  update(now) {
    this.scan(now);
    if (this.batchAt != null && now - this.batchAt >= BATCH_S) this.flush(now);
    const c = this.cur;
    if (c) {
      if (!c.played && now >= c.playAt) this.play(c, now);
      if (c.played && now >= c.endAt) this.cur = null;
    }
    while (!this.cur && this.queue.length) this.start(this.queue.shift(), now);
    if (!this.cur && !this.queue.length && this.batchAt == null) this.settle(now);
    if (!this.cur && !this.queue.length && this.wantRest && this.restAt == null) this.restAt = now + REST_DELAY;
    // A batch still collecting will make a shot in a moment: no return flight to cut short.
    if (this.restAt != null && now >= this.restAt && !this.o.held() && this.batchAt == null) {
      this.restAt = null;
      this.wantRest = false;
      if (!this.cur && !this.queue.length) this.goTo(this.restView(), now);
    }
    // At rest (no shot, no return due, the camera not the owner's, no flight under way: it lands first): the rest view
    // follows inputs that change without a shot (a value read again after null, V2L on / off), as the camera did before
    // the director; so does a camera left at the view of a shot whose change undid itself before it played.
    if (!this.cur && !this.queue.length && this.batchAt == null && !this.wantRest && this.restAt == null && !this.rig.manual
      && !this.rig.traj && !this.o.held()) {
      const key = this.restView();
      if (key !== this.rig.viewKey) this.goTo(key, now);
    }
  }

  /** Nothing playing or waiting: shown equals the live state (a change no shot carried applies quietly). */
  settle(now) {
    let changed = false;
    for (const k of PATHS) {
      const v = norm(this.read(k));
      if (this.shown[k] !== v) { this.shown[k] = v; changed = true; }
    }
    if (changed) this.mapping.sync(now);
  }

  goTo(key, now) {
    this.rig.flyTo(this.o.pose(key), now);
    this.rig.viewKey = key;
  }

  /** A command button: the camera turns to where the car will answer, before it answers (hides its latency). */
  preview(key, now) {
    if (!VIEWS[key] || this.o.held() || this.cur || this.queue.length) return;
    this.goTo(key, now);
    this.restAt = now + 5;
  }

  /**
   * A command failed: back to the rest view now (unless a shot plays, or the owner took the camera since: it stays
   * theirs). A preview flight still under way lands first, so the camera does not swing round in mid-turn.
   */
  failed(now) {
    if (this.cur || this.queue.length || this.rig.manual) return;
    const tr = this.rig.traj;
    this.restAt = tr ? Math.max(now, tr.t0 + tr.T) : now;
  }

  /** A shot without a state change (a successful find-car: the flash shot). */
  pulse(kind, now) {
    if (kind !== 'flash') return;
    const label = L('flash');
    this.enqueue({ view: 'flash', items: new Map([['pulse.flash', { k: 'pulse.flash', label }]]), label: [label], icon: 'light',
      paths: new Set(), fx: ['flash'], prio: 2, cap: 2 }, now);
  }

  /** The owner took the camera: no return to rest until the next action; a shot waiting for the camera plays now. */
  userTook(now) {
    this.restAt = null;
    this.wantRest = false;
    if (this.cur && !this.cur.played) this.cur.playAt = now;
  }

  /** The reset button: fly to the rest view now. */
  rest(now) {
    this.wantRest = false;
    this.restAt = null;
    this.goTo(this.restView(), now);
  }

  busy() { return !!(this.cur || this.queue.length); }

  /** A batch is collecting (frames run, nothing to draw yet). */
  waiting() { return this.batchAt != null; }

  /** One open part: its view; more: their mean direction (openView); a plug in (or V2L): the charge port; else the front-left 3/4. */
  restView() {
    const R = this.get;
    const open = [['doors.trunk', 'trunk'], ['doors.hood', 'hood'], ['doors.lf', 'doorFL'], ['doors.rf', 'doorFR'], ['doors.lr', 'doorRL'],
      ['doors.rr', 'doorRR'], ['doors.fuel', 'fuel']].filter(([k]) => R(k) === true);
    if (open.length === 1) return open[0][1];
    if (open.length > 1) return openView(open.map((o) => o[1]));
    if (R('charge.plugged') === true || R('charge.active') === true || R('charge.v2l') === true) return 'chargeRest';
    return 'home';
  }
}
