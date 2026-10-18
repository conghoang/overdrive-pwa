// Plain JS (no @types/node in this project): used by vite.config to give the 3D
// model a content-hashed FILENAME (sealion6-<hash>.glb). A changed model gets a
// brand-new file path, so no cache — service worker, browser, or CDN — can serve
// the old bytes under it; an unchanged model keeps its path and stays cached.
// This is the same technique Vite uses for hashed JS/CSS, and is stronger than a
// ?v= query, which an intermediary can strip or ignore.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

export function modelHash(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8)
  } catch {
    return null
  }
}

export function readModel(path) {
  try {
    return readFileSync(path)
  } catch {
    return null
  }
}
