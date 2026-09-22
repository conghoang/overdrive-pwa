/**
 * Tiny IndexedDB blob store.
 *
 * localStorage holds strings, so an image had to be base64'd into a data URL —
 * which inflates it ~33% and then costs ~2 bytes per character (UTF-16) against
 * a ~5 MB quota. IndexedDB stores a Blob as bytes, with a quota in the hundreds
 * of MB, so the car photo needs no size games at all.
 *
 * Hand-rolled rather than pulling in idb/localforage: one object store, three
 * operations, no schema evolution to manage.
 */

const DB_NAME = 'odpwa'
const DB_VERSION = 1
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    // Another tab holding an older version blocks the upgrade; don't hang forever.
    req.onblocked = () => reject(new Error('indexedDB blocked'))
  })
  // A failed open must not be cached, or every later call reuses the rejection.
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  }))
}

export function idbGet<T = Blob>(key: string): Promise<T | null> {
  return tx<T>('readonly', (s) => s.get(key)).then((v) => v ?? null)
}

export function idbSet(key: string, value: Blob): Promise<void> {
  return tx('readwrite', (s) => s.put(value, key)).then(() => undefined)
}

export function idbDel(key: string): Promise<void> {
  return tx('readwrite', (s) => s.delete(key)).then(() => undefined)
}
