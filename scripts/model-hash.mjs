// Plain JS (no @types/node in this project): compute a short content hash of a
// file, used by vite.config to version the 3D model URL (?v=<hash>) so the
// service-worker CacheFirst entry re-downloads it only when its bytes change.
// Returns null if the file can't be read, letting the caller fall back.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

export function modelHash(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8)
  } catch {
    return null
  }
}
