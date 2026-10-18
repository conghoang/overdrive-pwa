// Plain JS (no @types/node in this project): short content hash of a file, used
// by vite.config to version the 3D model URL (?v=<hash>). The model is cached by
// the service worker; a content-keyed URL means a new model is a new URL — a
// guaranteed fresh fetch that bypasses any stale cached copy — while an unchanged
// model keeps the same URL and stays cached. Returns null if the file is absent.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

export function modelHash(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8)
  } catch {
    return null
  }
}
