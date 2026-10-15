// Minimal stub for the vendored 3D hero. The hero receives its real t() via opts;
// this only needs to exist so hero.js's static import resolves.
let current = 'en';
export function t(key) { return key; }
export function lang() { return current; }
