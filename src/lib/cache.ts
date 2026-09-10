/**
 * Last-known payloads, so a screen opens on real numbers instead of an empty
 * frame while the car answers.
 *
 * Everything here is car-linked and lives under odpwa.*, so signing out clears
 * it along with the rest (see api.clearAll).
 */

/**
 * Read a cached value, or null.
 *
 * `revive` must VALIDATE, not cast. localStorage is shared with every other
 * page on this origin and survives app upgrades, so what comes back may be
 * another version's shape — or something a different site wrote. A wrong shape
 * reaching a formatter is a crash on the screen it was meant to speed up.
 */
export function readCache<T>(key: string, revive: (raw: unknown) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return revive(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Store a value, quietly. A cache that cannot be written is not worth an error
 * — private mode and a full quota both throw, and the screen works without it.
 */
export function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota */
  }
}

/** Finite number or null — the shape every cached figure is checked against. */
export function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null
}
