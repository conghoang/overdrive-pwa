// Post-build step for the watch app. public/watch/ is copied verbatim into
// dist/watch, so this is where it gets its production treatment:
//
//   1. Content-hash URLs: every file the watch page loads (backdrops, QR lib,
//      manifest, icons) is referenced as name?v=<hash of its content>, so a
//      changed file always gets a new URL and no browser can show a stale copy.
//      (index.html itself can't carry a hash — it's the URL people open — but
//      GitHub Pages revalidates it every 10 min.)
//   2. Minify (unless minify:false): terser for the scripts (top-level names
//      mangled too — nothing in the markup refers to a function by name),
//      esbuild (via Vite) for the CSS, comments / newline indentation stripped
//      from the HTML.
//
// Plain JS on purpose: the project has no @types/node, and vite.config.ts is
// type-checked by `tsc`.
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { minify as terser } from 'terser'
import { transformWithEsbuild } from 'vite'

const hashOf = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8)
const js = async (code, toplevel) =>
  (await terser(code, { toplevel, compress: { passes: 2 }, mangle: { toplevel }, format: { comments: /^!/ } })).code ?? code

async function hashes(dir, skip = []) {
  const out = {}
  for (const f of await readdir(dir)) if (!skip.includes(f)) out[f] = hashOf(await readFile(join(dir, f)))
  return out
}

export async function buildWatch(outDir, { minify = true } = {}) {
  const dir = join(outDir, 'watch')
  const icons = await hashes(join(outDir, 'icons'))
  let watch = {}                                // filled after the manifest is rewritten
  const withV = (url) => {                      // '../icons/x.png' | 'x.webp' -> '…?v=<hash>'
    const m = url.match(/^(\.\.\/icons\/)?([^/?#]+)$/)
    const h = m && (m[1] ? icons[m[2]] : watch[m[2]])
    return h ? `${url}?v=${h}` : url
  }

  // The manifest points at the icons: version those first, then hash the result.
  const manPath = join(dir, 'manifest.webmanifest')
  const man = JSON.parse(await readFile(manPath, 'utf8'))
  for (const i of man.icons || []) i.src = withV(i.src)
  await writeFile(manPath, JSON.stringify(man))
  watch = await hashes(dir, ['index.html', 'sw.js'])   // sw.js must keep a stable URL

  let html = await readFile(join(dir, 'index.html'), 'utf8')
  // Files the script builds URLs for at runtime (backdrops, QR lib) -> ASSET_V map.
  if (!html.includes('/*ASSET_V*/{}')) throw new Error('watch/index.html: ASSET_V placeholder missing')
  html = html.replace('/*ASSET_V*/{}', () => JSON.stringify(watch))
  // Static references in the markup (manifest, favicons, touch icon).
  html = html.replace(/(\bhref=")([^"]+)(")/g, (_, a, url, b) => a + withV(url) + b)

  if (minify) {
    const parts = []
    for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g))
      parts.push([m[0], `<style>${(await transformWithEsbuild(m[1], 'w.css', { loader: 'css', minify: true })).code.trim()}</style>`])
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    for (const [i, m] of scripts.entries())
      // The last script is the app; earlier ones (the pre-paint theme snippet) stay global.
      parts.push([m[0], `<script>${await js(m[1], i === scripts.length - 1)}</script>`])
    for (const [from, to] of parts) html = html.replace(from, () => to)
    html = html
      .replace(/<!--(?!\[)[\s\S]*?-->/g, '')  // HTML comments
      .replace(/>\s*\n\s*</g, '><')           // indentation between tags (same-line spaces are kept)
      .replace(/\n\s*/g, ' ')
      .trim()
    const sw = join(dir, 'sw.js')
    await writeFile(sw, await js(await readFile(sw, 'utf8'), true))
  }
  await writeFile(join(dir, 'index.html'), html)
  return { assets: Object.keys(watch).length, icons: Object.keys(icons).length }
}
