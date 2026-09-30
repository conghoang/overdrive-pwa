// Minify the watch app copies in dist/watch after the build. public/watch/ is
// copied verbatim, so its hand-written, commented source would otherwise ship
// as-is. terser for the scripts (top-level names mangled too — nothing in the
// markup refers to a function by name), esbuild (via Vite) for the CSS, and
// comments / newline indentation stripped from the HTML.
// Plain JS on purpose: the project has no @types/node, and vite.config.ts is
// type-checked by `tsc`.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { minify as terser } from 'terser'
import { transformWithEsbuild } from 'vite'

const js = async (code, toplevel) =>
  (await terser(code, { toplevel, compress: { passes: 2 }, mangle: { toplevel }, format: { comments: /^!/ } })).code ?? code

export async function minifyWatch(outDir) {
  const dir = join(outDir, 'watch')
  let html = await readFile(join(dir, 'index.html'), 'utf8')
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
  await writeFile(join(dir, 'index.html'), html)
  const sw = join(dir, 'sw.js')
  await writeFile(sw, await js(await readFile(sw, 'utf8'), true))
}
