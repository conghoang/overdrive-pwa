// Minimal stub — the hero passes a real fmt via opts; this is the fallback.
export const fmt = {
  kw: (x) => (typeof x === 'number' && isFinite(x) ? x.toFixed(1) + ' kW' : '--'),
  pressure: (x) => (typeof x === 'number' && isFinite(x) ? String(Math.round(x)) : '--'),
};
