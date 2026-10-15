/*
 * core/dom.js (U3, CONTRACTS 3.1): DOM building without HTML parsing. Text always goes through textContent, so
 * server text can never become markup. Adapted from the fork's od.h / od.icon (FA:web/shared/od/od-core.js:62-104).
 * own() / release(): the cleanups (store / caps subscriptions, timers) of components bound to an element, released
 * with the screen or sheet that held it (CONTRACTS 2.1: an unmount releases every timer and subscription).
 */
import { clock } from './clock.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function doc() { return globalThis.document; }

const owned = new Set();

/**
 * own(el, stop) -> drop(): registers stop() as the cleanup of a component bound to el (a caps binding, the freshness
 * loop). drop() runs it once and forgets it. release(root) runs it when el is inside root, or when el was attached
 * once and has left the document since (rows a live screen rebuilt). An element never attached is kept: it may be a
 * part built ahead that the screen attaches later.
 */
export function own(el, stop) {
  if (!el || typeof stop !== 'function') return () => {};
  const rec = { el, stop, seen: el.isConnected === true };
  owned.add(rec);
  if (!rec.seen) clock.raf(() => { if (el.isConnected) rec.seen = true; });
  return () => {
    if (!owned.delete(rec)) return;
    try { stop(); } catch (e) { /* a cleanup never breaks the caller */ }
  };
}

/** Marks el as attached (a component that saw it in the document): release() may then drop it once it is detached. */
export function seenOwned(el) {
  for (const rec of owned) if (rec.el === el) rec.seen = true;
}

/** Runs the cleanups of everything own()ed under root (and of detached parts seen attached before). Returns the count. */
export function release(root) {
  let n = 0;
  for (const rec of Array.from(owned)) {
    const el = rec.el;
    const inside = !!root && (el === root || (typeof root.contains === 'function' && root.contains(el)));
    if (!inside && !(rec.seen && el.isConnected === false)) continue;
    owned.delete(rec);
    n += 1;
    try { rec.stop(); } catch (e) { /* ignore */ }
  }
  return n;
}

/** Tests: the number of live registrations. */
export function _ownedCount() { return owned.size; }

/** 'div#id.a.b' -> {tag, id, cls[]} */
function parseSel(sel) {
  const out = { tag: 'div', id: null, cls: [] };
  const m = String(sel || 'div').match(/^([a-zA-Z][a-zA-Z0-9-]*)?((?:[#.][A-Za-z0-9_-]+)*)$/);
  if (!m) return out;
  if (m[1]) out.tag = m[1];
  const rest = m[2] || '';
  const re = /([#.])([A-Za-z0-9_-]+)/g;
  let x;
  while ((x = re.exec(rest))) {
    if (x[1] === '#') out.id = x[2];
    else out.cls.push(x[2]);
  }
  return out;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true) continue;
    if (Array.isArray(k)) append(el, k);
    else if (typeof k === 'string' || typeof k === 'number') el.appendChild(doc().createTextNode(String(k)));
    else el.appendChild(k);
  }
}

function setAttrs(el, attrs) {
  if (!attrs) return;
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
}

function apply(el, props) {
  if (!props) return;
  if (props.attrs) setAttrs(el, props.attrs);
  if (props.aria) {
    for (const k of Object.keys(props.aria)) {
      const v = props.aria[k];
      if (v == null) continue;
      el.setAttribute(`aria-${k}`, String(v));
    }
  }
  if (props.dataset) {
    for (const k of Object.keys(props.dataset)) {
      const v = props.dataset[k];
      if (v == null) continue;
      el.setAttribute(`data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(v));
    }
  }
  if (props.style) {
    for (const k of Object.keys(props.style)) {
      const v = props.style[k];
      if (v == null) continue;
      if (k.startsWith('--')) el.style.setProperty(k, String(v));
      else el.style[k] = String(v);
    }
  }
  if (props.cls) {
    String(props.cls).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
  }
  if (props.on) {
    for (const k of Object.keys(props.on)) {
      if (typeof props.on[k] === 'function') el.addEventListener(k, props.on[k]);
    }
  }
  if (props.text != null) el.textContent = String(props.text);
}

/** h('div.a.b', {attrs, dataset, aria, style, on, text, cls}, ...kids): an HTML element. */
export function h(sel, props, ...kids) {
  const s = parseSel(sel);
  const el = doc().createElement(s.tag);
  if (s.id) el.id = s.id;
  if (s.cls.length) el.className = s.cls.join(' ');
  apply(el, props);
  append(el, kids);
  return el;
}

/** svg('circle.ring', {cx: 1}, ...kids): an SVG element (attributes set verbatim). */
export function svg(sel, attrs, ...kids) {
  const s = parseSel(sel);
  const el = doc().createElementNS(SVGNS, s.tag);
  if (s.id) el.setAttribute('id', s.id);
  if (s.cls.length) el.setAttribute('class', s.cls.join(' '));
  setAttrs(el, attrs);
  append(el, kids);
  return el;
}

/** <svg class="ico [cls]"><use href="#i-<id>"/></svg> from the inline sprite (DS 2.9). */
export function icon(id, cls = '') {
  const el = doc().createElementNS(SVGNS, 'svg');
  el.setAttribute('class', `ico${cls ? ` ${cls}` : ''}`);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  const use = doc().createElementNS(SVGNS, 'use');
  use.setAttribute('href', `#i-${String(id || 'info').replace(/[^a-z0-9-]/gi, '')}`);
  el.appendChild(use);
  return el;
}

/** Writes only on change (no layout churn). */
export function setText(el, s) {
  const v = s == null ? '' : String(s);
  if (el && el.textContent !== v) el.textContent = v;
}

export function setState(el, state) {
  if (!el) return;
  if (state == null || state === '') {
    if (el.hasAttribute('data-state')) el.removeAttribute('data-state');
  } else if (el.getAttribute('data-state') !== String(state)) {
    el.setAttribute('data-state', String(state));
  }
}

export function toggle(el, cls, on) {
  if (el && el.classList) el.classList.toggle(cls, !!on);
}

export function clear(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function $(sel, root) {
  const r = root || doc();
  return r && r.querySelector ? r.querySelector(sel) : null;
}

export function $$(sel, root) {
  const r = root || doc();
  return r && r.querySelectorAll ? Array.prototype.slice.call(r.querySelectorAll(sel)) : [];
}
