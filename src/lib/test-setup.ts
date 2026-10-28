/*
 * The bare minimum of a browser for the modules under test: an in-memory
 * localStorage, and a document for i18n to stamp its lang onto.
 */
class MemoryStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  key(i: number) { return [...this.m.keys()][i] ?? null }
}

const storage = new MemoryStorage()
// Object.keys(localStorage) is how clearAll walks it, so expose the keys too.
const proxy = new Proxy(storage, {
  ownKeys: (target) => [...(target as unknown as { m: Map<string, string> }).m.keys()],
  getOwnPropertyDescriptor: (target, k) =>
    typeof k === 'string' && target.getItem(k) !== null
      ? { enumerable: true, configurable: true, value: target.getItem(k) }
      : undefined,
})

Object.defineProperty(globalThis, 'localStorage', { value: proxy, configurable: true })
Object.defineProperty(globalThis, 'document', {
  value: { documentElement: { lang: '' }, hidden: false },
  configurable: true,
})
