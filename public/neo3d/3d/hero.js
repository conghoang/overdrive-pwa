/*
 * neo/3d/hero.js: the car hero of Home (and of the compact car in Controls). OverDrive Neo (U4) rewrite of the
 * fork's phone/3d/hero.js (FA:phone/3d/hero.js), keeping its structure (DS 4.1-4.2, 6; SCREEN-MAP 3.3 H9, H10, H20,
 * 3.9; CONTRACTS 3.15). Small and free of three.js: car3d.js (and with it vendor/three) is imported only when the
 * 3D car can be shown.
 *
 * mountHero(stage, opts) -> HeroHandle
 * - The 2D SVG car (lib/car2d.js) draws at once and stays until the first 3D frame, then a 350 ms cross-fade.
 * - 3D only when WebGL2 exists, the bundled model answers (models/sealion6.glb) and the car's model is the Sealion 6 /
 *   Seal U DM-i (meta.modelId, DS 4.7). No model (404), no WebGL2 context or a load error: 2D for the rest of the page
 *   session. A lost context rebuilds from the cached bytes after 1.2 s, at most twice per mount.
 * - Car on (D61, D23): the 3D car's power level comes from power.acc alone (heroLevel: true 2, false 0, unknown null),
 *   so acc === true shows the approved round READY halo and ring under the car (mapping.js, car3d.js) and an acc edge
 *   plays the approved start / stop shot; a change from or to unknown is quiet (no shot).
 * - The action caption (bottom centre, catalog text, never "READY": the start shot says neo.home.act_on "Car on", D23)
 *   and the pop icon over the roof (WAAPI 1850 ms; car3d.js places it each frame).
 * - send({path, body}) / sent({path, body, ok}): a command turns the camera to where the car will answer before it
 *   answers; a refused one returns to the rest view; a flash or find-car the car accepted plays the flash shot.
 * - setTheme(light): exposure, contact shadow, halo and ripple blending (car3d.js, mapping.js).
 * - pin(el, spec) / onFrame(cb): generic overlays pinned to the car, kept while the 3D car is rebuilt.
 * Nothing here sends a command or reads the network except the model file.
 */
import { h as neoH, icon as neoIcon } from '../js/core/dom.js';
import { t as neoT } from '../js/core/i18n.js';
import { fmt as neoFmt } from '../js/core/fmt.js';

export const MODEL_URL = '/neo3d/models/sealion6.glb';
/** Manifest ids that are the Sealion 6 / Seal U DM-i the model shows (DS 4.7; W55 models/manifest.json). */
export const MODEL_IDS = ['seal-u-dmi', 'seal-u'];
/** The 3D car is for this car's model only (null = no model chosen = the 2D car, SCREEN-MAP H20). */
export const eligibleModel = (read) => MODEL_IDS.includes(read('meta.modelId'));
export const HOME_FIT = 1.08;
const LOST_RETRY_MS = 1200;
const MAX_TRIES = 3;
const CAPTION_S = 3;
const FADE_MS = 400;

// Commands -> the director view where the car will answer (handoff C8; DS 3.5 camera preview). Window areas: 0 all,
// 1 lf, 2 rf, 3 lr, 4 rr (left = +X, the driver's side on LHD), 5 sunroof, 6 shade.
const PREVIEW = {
  '/api/vehicle/lock': 'lock', '/api/vehicle/unlock': 'unlock', '/api/vehicle/trunk': 'trunk',
  '/api/vehicle/find-car': 'flash', '/api/vehicle/flash': 'flash', '/api/vehicle/lights': 'lightsF',
  '/api/vehicle/start-charging': 'charge', '/api/vehicle/power-on': 'start'
};
const WINDOW_VIEW = ['winAll', 'winL', 'winR', 'winL', 'winR', 'roof', 'roof'];
const FLASH_PATHS = ['/api/vehicle/find-car', '/api/vehicle/flash'];

/** The view a command will play at, or null: no camera move for it (exported for tests). */
export function previewView(path, body) {
  const b = body && typeof body === 'object' ? body : {};
  const p = String(path || '').split('?')[0];
  if (p === '/api/vehicle/window') return b.action === 'vent' ? 'winAll' : WINDOW_VIEW[b.area] || null;
  if (p === '/api/vehicle/climate') return b.action === 'power_on' ? 'ac' : null;
  return PREVIEW[p] || null;
}

// The director's caption keys Neo replaces (D23: stock has no READY level; SCREEN-MAP 3.11).
export const CAPTION_KEYS = { 'ph.act.start': 'neo.home.act_on', 'ph.act.acc_on': 'neo.home.act_on', 'ph.act.acc_off': 'ph.act.stop' };

/**
 * The power level the 3D car plays (D61, D23; DS D-P1): stock has no READY level, /status.acc is "on", so acc === true
 * is level 2 (the approved READY halo and ring, the start shot on the edge), acc === false level 0 (the stop shot on the
 * edge), unknown null (no halo, and a change from or to null is never a shot). Whatever the store holds in power.level.
 */
export function heroLevel(read) {
  const acc = read('power.acc');
  return acc === true ? 2 : acc === false ? 0 : null;
}

/** read(path) for the 3D car: the store's, with power.level from heroLevel(). */
export function heroRead(read) {
  return (path) => (path === 'power.level' ? heroLevel(read) : read(path));
}

/** The approved READY halo and the car-on ring show exactly while this is true (mapping.js: ready = level === 2). */
export const haloOn = (read) => heroLevel(read) === 2;

// The pop icon (handoff C5): in, a little overshoot, hold, out. With prefers-reduced-motion it only fades.
const POP = [
  { opacity: 0, transform: 'translateY(10px) scale(.6)' }, { opacity: 1, transform: 'translateY(0) scale(1.08)', offset: 0.2 },
  { opacity: 1, transform: 'scale(1)', offset: 0.32 }, { opacity: 1, transform: 'scale(1)', offset: 0.78 },
  { opacity: 0, transform: 'translateY(-8px) scale(.92)' }
];
const POP_STILL = [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.78 }, { opacity: 0 }];
const POP_TIMING = { duration: 1850, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' };

let sessionFail = null;   // 'nomodel' | 'webgl' | 'error': no 3D for the rest of this page session
let glb = null;           // the model bytes, kept for this page session
let glbUrl = null;
let fetching = null;

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** WebGL2 in this WebView (DS 6: typeof WebGL2RenderingContext === 'function'). */
export function webgl2() { return typeof globalThis.WebGL2RenderingContext === 'function'; }

/** Why the last 3D attempt fell back to 2D in this page session (diagnostics), or null. */
export function lastFailure() { return sessionFail; }

/** The model bytes, once per page session; rejects with e.code 'nomodel' (404) or 'http'. */
function modelBytes(url) {
  if (glb && glbUrl === url) return Promise.resolve(glb);
  if (!fetching) {
    fetching = globalThis.fetch(url, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) {
        const e = new Error(`model ${r.status}`);
        e.code = r.status === 404 ? 'nomodel' : 'http';
        throw e;
      }
      return r.arrayBuffer();
    }).then((b) => {
      glb = b;
      glbUrl = url;
      return b;
    });
    fetching.then(() => { fetching = null; }, () => { fetching = null; });
  }
  return fetching;
}

function visEmitter() {
  const W = globalThis;
  if (W.od && W.od.vis && typeof W.od.vis.on === 'function') return W.od.vis;
  // Without the od facade: the document's own visibility.
  return {
    on(kind, fn) {
      const d = W.document;
      if (!d || typeof d.addEventListener !== 'function') return () => {};
      const f = () => { if ((d.visibilityState === 'hidden') === (kind === 'hide')) fn(); };
      d.addEventListener('visibilitychange', f);
      return () => d.removeEventListener('visibilitychange', f);
    },
  };
}

/**
 * opts = {read(path) (required, store.read), modelUrl, light, t, icon, h, fmt, isNum, setKind(kind), onPick(part,
 * point), fit (default 1.08), demo, eligible(read) (default eligibleModel), onReady(kind)}.
 * HeroHandle = {update(changed), refresh(), setTheme(light), send(cmd), sent(cmd), resetView(), pin(el, spec),
 * onFrame(cb), invalidate(), stats(), kind(), ready: Promise<'2d' | '3d'>, destroy()}.
 */
export function mountHero(stage, opts = {}) {
  const W = globalThis;
  const o = opts || {};
  const read = typeof o.read === 'function' ? o.read : () => null;
  const carRead = heroRead(read);
  const tBase = typeof o.t === 'function' ? o.t : neoT;
  const h = typeof o.h === 'function' ? o.h : neoH;
  const icon = typeof o.icon === 'function' ? o.icon : neoIcon;
  const env = {
    h,
    icon,
    t: (k, p) => tBase(CAPTION_KEYS[k] || k, p),
    isNum: typeof o.isNum === 'function' ? o.isNum : isNum,
    fmt: o.fmt && typeof o.fmt.kw === 'function' && typeof o.fmt.pressure === 'function' ? o.fmt : neoFmt,
    vis: visEmitter(),
  };
  const modelUrl = typeof o.modelUrl === 'string' && o.modelUrl.startsWith('/') ? o.modelUrl : MODEL_URL;
  const fit = isNum(o.fit) && o.fit > 0.2 && o.fit < 2 ? o.fit : HOME_FIT;
  const eligible = typeof o.eligible === 'function' ? o.eligible : eligibleModel;
  const setKind = typeof o.setKind === 'function' ? o.setKind : () => {};

  stage.classList.add('neo-hero-stage');
  const layer2d = h('div.neo-hero-layer.neo-hero-2d');
  const layer3d = h('div.neo-hero-layer.neo-hero-3d');
  const labels = h('div.neo-hero-labels');
  const busy = h('div.neo-hero-busy', { attrs: { role: 'status' }, text: env.t('ph.hero3d_loading') });
  busy.hidden = true;
  const reset = h('button.neo-hero-reset', { attrs: { type: 'button', 'aria-label': env.t('ph.hero3d_reset') } }, icon('recenter'));
  reset.hidden = true;
  const capIco = h('span.neo-hero-caption-ico', { attrs: { 'aria-hidden': 'true' } });
  const capText = h('span.neo-hero-caption-t');
  const caption = h('div.neo-hero-caption', { attrs: { 'aria-live': 'polite' } }, capIco, capText);
  const popIn = h('div.neo-hero-pop-in');
  const pop = h('div.neo-hero-pop', { attrs: { 'aria-hidden': 'true' } }, popIn);
  pop.hidden = true;
  layer3d.appendChild(labels);
  layer3d.appendChild(pop);
  stage.appendChild(layer2d);
  stage.appendChild(layer3d);
  stage.appendChild(busy);
  stage.appendChild(caption);
  stage.appendChild(reset);

  const still = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let car2d = null;
  let car3d = null;
  let pending = null;       // a 3D car still loading: the screen can go away before its first frame
  let dead = false;
  let tries = 0;
  let kind = '2d';
  let light = !!o.light;
  let plateText = o.plate != null ? o.plate : null;   // custom number-plate text (covers the baked plates)
  let capTimer = 0;
  let popAnim = null;
  let source = null;        // the demo script (owner's "Play all" check), never the car
  let fadeTimer = 0;
  let retryTimer = 0;
  let gen = 0;              // the current 3D attempt; a newer one (or a model change) abandons the older
  const pins = [];          // {el, spec, off}
  const frameCbs = [];      // {fn, off}
  const idleWaiters = [];
  let resolveReady;
  let readyDone = false;
  const ready = new Promise((r) => { resolveReady = r; });
  const settle = (k) => {
    if (readyDone) return;
    readyDone = true;
    resolveReady(k);
    if (typeof o.onReady === 'function') { try { o.onReady(k); } catch (e) { /* the caller's problem */ } }
  };
  /** No 3D load under way any more: wake whoever waits for the hero to settle. */
  const idle = () => {
    if (pending) return;
    for (const fn of idleWaiters.splice(0)) { try { fn(kind); } catch (e) { /* ignore */ } }
  };

  reset.addEventListener('click', (e) => {
    e.stopPropagation();
    if (car3d) car3d.resetView();
  });

  // ---- the 2D car (lib/car2d.js on the od facade)
  let svgWatch = null;
  function mount2d() {
    if (car2d || dead) return;
    layer2d.classList.remove('is-gone');
    const od = W.od;
    const go = () => {
      if (dead || car2d || !W.od || !W.od.car2d) return;
      car2d = W.od.car2d.mount(layer2d);
      if (kind === '2d' && !readyDone && W.MutationObserver) {
        const done = () => { if (svgWatch) { svgWatch.disconnect(); svgWatch = null; } if (kind === '2d' && !pending) settle('2d'); };
        if (layer2d.querySelector && layer2d.querySelector('svg')) done();
        else {
          svgWatch = new W.MutationObserver(() => { if (layer2d.querySelector('svg')) done(); });
          svgWatch.observe(layer2d, { childList: true });
          W.setTimeout(() => { if (kind === '2d' && !pending) settle('2d'); }, 3000);
        }
      }
    };
    if (od && od.car2d) go();
    else if (od) import('../lib/car2d.js').then(go, (e) => { if (od.report) od.report(e); settle('2d'); });
    else settle('2d');
  }

  function drop2d() {
    if (car2d) { car2d.destroy(); car2d = null; }
  }

  // ---- caption and pop icon
  function hideCaption() {
    if (capTimer) W.clearTimeout(capTimer);
    capTimer = 0;
    caption.classList.remove('is-on');
  }
  function onCaption(text, ico, holdS) {
    if (dead || !text) return;
    const i = ico || 'door';
    capText.textContent = text;
    if (caption.getAttribute('data-icon') !== i) {
      caption.setAttribute('data-icon', i);
      capIco.textContent = '';
      capIco.appendChild(icon(i));
    }
    caption.classList.add('is-on');
    // No hide time of its own: keep the running one, or a short one when none runs.
    if (holdS == null && capTimer) return;
    if (capTimer) W.clearTimeout(capTimer);
    capTimer = W.setTimeout(hideCaption, (holdS == null ? CAPTION_S : holdS) * 1000);
  }
  function onPop(k) {
    if (dead) return;
    pop.setAttribute('data-kind', k);
    popIn.textContent = '';
    popIn.appendChild(icon(k));
    if (popAnim) popAnim.cancel();
    popAnim = popIn.animate ? popIn.animate(still ? POP_STILL : POP, POP_TIMING) : null;
    if (!popAnim) popIn.style.opacity = '1';     // no WAAPI: shown until car3d.js hides it (1.9 s)
  }

  function show2d(code) {
    if (code && code !== 'lost') sessionFail = code;
    busy.hidden = true;
    reset.hidden = true;
    hideCaption();
    layer3d.classList.remove('is-live');
    kind = '2d';
    mount2d();
    setKind('2d');
  }

  function attach(inst) {
    for (const p of pins) p.off = inst.pin(p.el, p.spec);
    for (const f of frameCbs) f.off = inst.onFrame(f.fn);
  }

  function canTry3d() {
    return !dead && !car3d && !pending && !sessionFail && webgl2() && (source || eligible(read) === true);
  }

  function start3d() {
    if (!canTry3d()) return;
    tries += 1;
    const my = ++gen;
    const stale = () => dead || my !== gen;
    busy.hidden = false;
    let inst = null;
    const bytes = modelBytes(modelUrl);
    let missing = null;
    bytes.catch((e) => { missing = e; });   // also reported through Car3D.start()
    pending = true;
    import('./car3d.js').then(async (m) => {
      if (stale()) return;
      if (missing) throw missing;           // no WebGL context for a model that is not there
      if (o.demo && !source) {
        const mp = await import('./mapping.js');
        source = mp.demoSource((k) => { if (car3d) car3d.pulse(k); });
        if (stale()) return;
      }
      inst = pending = new m.Car3D(env, layer3d, {
        bytes,
        read: source ? source.read : carRead,
        demo: source,
        labels,
        light,
        fit,
        plate: plateText,
        popEl: pop,
        onCaption,
        onPop,
        onFirstFrame() {
          if (stale()) { inst.destroy(); return; }
          car3d = inst;
          pending = null;
          busy.hidden = true;
          layer3d.classList.add('is-live');
          layer2d.classList.add('is-gone');
          reset.hidden = false;
          kind = '3d';
          setKind('3d');
          attach(inst);
          if (light !== inst.light) inst.setTheme(light);
          inst.update();
          settle('3d');
          idle();
          // The 2D car leaves after the cross-fade.
          if (fadeTimer) W.clearTimeout(fadeTimer);
          fadeTimer = W.setTimeout(() => {
            fadeTimer = 0;
            if (!dead && car3d === inst) drop2d();
          }, FADE_MS);
        },
        onFail(code) { fail(code); },
        onPick(part, point) {
          if (stale() || source || typeof o.onPick !== 'function') return;
          o.onPick(part, point);
        }
      });
      if (stale()) { inst.destroy(); return; }
      await inst.start();
    }).catch((e) => {
      fail(e && e.code ? e.code : 'error', e);
    });

    function fail(code, e) {
      if (stale()) {
        if (inst) inst.destroy();
        return;
      }
      if (e && code === 'error' && W.od && W.od.report) W.od.report(e);
      for (const p of pins) { if (p.off) { p.off(); p.off = null; } }
      for (const f of frameCbs) { if (f.off) { f.off(); f.off = null; } }
      if (inst) inst.destroy();
      if (car3d === inst) car3d = null;
      if (pending === inst || pending === true) pending = null;
      inst = null;
      show2d(code);
      if (!readyDone) settle('2d');
      idle();
      // A lost context (GPU reset, too many contexts): rebuild from the cached bytes, at most twice.
      if (code === 'lost' && tries < MAX_TRIES) {
        if (retryTimer) W.clearTimeout(retryTimer);
        retryTimer = W.setTimeout(() => { retryTimer = 0; start3d(); }, LOST_RETRY_MS);
      }
    }
  }

  /** The car's model changed (a page closed, models re-read): 3D when it became eligible, 2D when it stopped being. */
  function recheckModel() {
    if (dead || source) return;
    const ok = eligible(read) === true;
    if (ok && !car3d && !pending) start3d();
    else if (!ok && (car3d || pending)) {
      const c = car3d || (pending !== true ? pending : null);
      gen += 1;               // an attempt still loading is abandoned
      car3d = null;
      pending = null;
      for (const p of pins) { if (p.off) { p.off(); p.off = null; } }
      for (const f of frameCbs) { if (f.off) { f.off(); f.off = null; } }
      if (c) c.destroy();
      show2d(null);
      idle();
    }
  }

  setKind('2d');
  mount2d();
  if (canTry3d()) start3d();
  else if (!webgl2() || sessionFail) settle('2d');
  // Not eligible yet (no model chosen, or the selection not read yet): 2D until update() sees meta.modelId.

  const handle = {
    ready,
    kind: () => kind,
    /** Resolves (with the kind) once no 3D load is under way: at once, or after the first 3D frame or the fallback. */
    whenIdle() {
      return new Promise((r) => {
        if (!pending || dead) r(kind);
        else idleWaiters.push(r);
      });
    },
    update(changed) {
      if (dead) return;
      if (car2d) car2d.update(changed || []);
      if (car3d && !source) car3d.update(changed);
      if (!changed || changed.includes('meta.modelId')) recheckModel();
    },
    refresh() {
      if (dead) return;
      if (car2d) car2d.refresh();
      if (car3d && !source) car3d.update([]);
      recheckModel();
    },
    setTheme(l) {
      light = !!l;
      if (car3d) car3d.setTheme(light);
      else if (pending && pending !== true) pending.setTheme(light);
    },
    /** Set the custom number-plate text (front + rear); '' blanks it. */
    setPlate(text) {
      plateText = text;
      const inst2 = car3d || (pending && pending !== true ? pending : null);
      if (inst2) inst2.setPlate(text);
    },
    /** A command is about to be sent: {path, body}. */
    send(cmd) {
      const view = cmd && !source ? previewView(cmd.path, cmd.body) : null;
      if (view && car3d) car3d.preview(view);
    },
    /** The command's answer: {path, body, ok}. */
    sent(cmd) {
      if (!cmd || source || !car3d || !previewView(cmd.path, cmd.body)) return;
      const p = String(cmd.path || '').split('?')[0];
      if (!cmd.ok) car3d.commandFailed();
      else if (FLASH_PATHS.includes(p)) car3d.pulse('flash');
    },
    resetView() { if (car3d) car3d.resetView(); },
    pin(el, spec) {
      const p = { el, spec: spec || {}, off: null };
      pins.push(p);
      el.style.opacity = '0';
      layer3d.appendChild(el);
      if (car3d) p.off = car3d.pin(el, p.spec);
      return () => {
        const i = pins.indexOf(p);
        if (i >= 0) pins.splice(i, 1);
        if (p.off) p.off();
        if (el.parentNode) el.parentNode.removeChild(el);
      };
    },
    onFrame(fn) {
      if (typeof fn !== 'function') return () => {};
      const f = { fn, off: null };
      frameCbs.push(f);
      if (car3d) f.off = car3d.onFrame(fn);
      return () => {
        const i = frameCbs.indexOf(f);
        if (i >= 0) frameCbs.splice(i, 1);
        if (f.off) f.off();
      };
    },
    invalidate() { if (car3d) car3d.invalidate(); },
    /** Draw calls, triangles, pixel ratio, frame gaps (the owner's K9 check); null while 2D. */
    stats() { return car3d ? car3d.stats() : null; },
    destroy() {
      if (dead) return;
      dead = true;
      hideCaption();
      if (popAnim) popAnim.cancel();
      popAnim = null;
      if (fadeTimer) W.clearTimeout(fadeTimer);
      if (retryTimer) W.clearTimeout(retryTimer);
      if (svgWatch) { svgWatch.disconnect(); svgWatch = null; }
      // Leaving while the 3D car still loads: free its WebGL context and listeners too (they would hold it).
      gen += 1;
      if (pending && pending !== true) pending.destroy();
      pending = null;
      if (car3d) car3d.destroy();
      car3d = null;
      drop2d();
      pins.length = 0;
      frameCbs.length = 0;
      stage.classList.remove('neo-hero-stage');
      while (stage.firstChild) stage.removeChild(stage.firstChild);
      settle('2d');
      idle();
    },
  };
  return handle;
}
