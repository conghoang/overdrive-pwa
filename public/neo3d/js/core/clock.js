/*
 * core/clock.js (U3): the one time source of the SPA core. Pollers, commands, the hold timer, toasts and the
 * freshness line read time and set timers only through this object, so node tests can swap in a fake clock
 * (useClock) and prove the D16 floors and the 800 ms hold without real waiting. setTimeout chains only: there is
 * no setInterval anywhere in the SPA core (API 10.8 rule 2).
 */
const G = typeof globalThis !== 'undefined' ? globalThis : window;

export const clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => G.setTimeout(fn, ms),
  clearTimeout: (id) => G.clearTimeout(id),
  random: () => Math.random(),
  /** requestAnimationFrame when there is one (browser), else a 16 ms timer (node, hidden documents). */
  raf: (fn) => (typeof G.requestAnimationFrame === 'function' ? G.requestAnimationFrame(fn) : G.setTimeout(fn, 16)),
};

/** Tests only: replace any of now / setTimeout / clearTimeout / random / raf. */
export function useClock(parts) {
  Object.keys(parts || {}).forEach((k) => {
    if (typeof parts[k] === 'function') clock[k] = parts[k];
  });
}
