import { defineConfig, type UserConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

declare const process: { env: Record<string, string | undefined> }

// Standalone PWA: served from anywhere, talks to the OverDrive head-unit backend
// over its tunnel / LAN URL (stored in localStorage). CORS on the backend is `*`
// and auth is a Bearer JWT, so cross-origin requests work fine.
// GitHub Pages project site is served under /<repo>/. Override with
// BASE_PATH=/ for root deploys (custom domain / user page / same-origin car).
const base = process.env.BASE_PATH ?? '/overdrive-pwa/'

/*
 * The dev branch is published as a sub-site at <base>dev/ by the same workflow,
 * so one Pages deployment carries both. Two consequences, handled below.
 *
 * 1. The production service worker's scope is the WHOLE of <base>, which
 *    includes dev/. With navigateFallback set, it would answer a navigation to
 *    the dev site with production's index.html — so anyone carrying the prod
 *    PWA in their cache would silently get prod when they opened dev. The
 *    denylist below keeps it off those URLs.
 * 2. Installed, the two would be indistinguishable. The dev build takes a
 *    suffixed name so they can be told apart on a home screen.
 */
const isDevSite = base.endsWith('/dev/')

// Commit hash (from CI's GITHUB_SHA / VITE_COMMIT). Appended as a ?v= query to
// the app's asset URLs so each deploy busts caches — without renaming files.
const commit = (process.env.VITE_COMMIT || process.env.GITHUB_SHA || 'dev').slice(0, 7)

// The 3D model gets a content-hashed FILENAME (sealion6-<hash>.glb), emitted
// below. A changed model is a brand-new file path, so no cache — service worker,
// browser or CDN — can serve the old bytes under it; an unchanged model keeps its
// path. Stronger than a ?v= query (which an intermediary can strip). Computed in
// a plain-JS helper (no @types/node here), resolved before the config is built.
const modelHashHelper = './scripts/model-hash.mjs'
const MODEL_SRC = 'public/neo3d/models/sealion6.glb'

export default defineConfig(async (): Promise<UserConfig> => {
  const { modelHash, readModel } = await import(/* @vite-ignore */ modelHashHelper)
  const modelV: string = modelHash(MODEL_SRC) || commit
  const modelBuf: Uint8Array | null = readModel(MODEL_SRC)

  return {
  base,
  define: { __COMMIT__: JSON.stringify(commit), __MODEL_V__: JSON.stringify(modelV) },
  plugins: [
    preact(),
    {
      name: 'build-watch',
      apply: 'build',
      enforce: 'post',
      // Content-hash asset URLs + minify for dist/watch (see scripts/build-watch.mjs).
      // WATCH_NOMIN=1 keeps it unminified (still hashed), for tests that poke
      // internal functions like load().
      async closeBundle() {
        const helper = './scripts/build-watch.mjs'   // plain JS: no @types/node here
        const { buildWatch } = await import(/* @vite-ignore */ helper)
        await buildWatch('dist', { minify: !process.env.WATCH_NOMIN })
      },
    },
    {
      /*
       * Append ?v=<commit> to local <link href> CSS in index.html.
       *
       * CSS ONLY — deliberately not the entry <script>. That script is an ES
       * module, and a query string makes it a DIFFERENT module specifier to the
       * browser: the entry loads `index-abc.js?v=<commit>` while a lazily
       * imported chunk resolves the same file as plain `index-abc.js`. The
       * browser then evaluates it twice, so a code-split screen gets its own
       * second copy of Preact and every hook in it throws on null state.
       *
       * Cache-busting for JS is already handled: Vite content-hashes the
       * filename, which is stronger than a query the module graph disagrees on.
       */
      name: 'asset-version-query',
      enforce: 'post',
      transformIndexHtml(html) {
        return html.replace(/(\bhref=")(\/[^"]+\.css)"/g, `$1$2?v=${commit}"`)
      },
    },
    {
      // Emit the 3D model under its content-hashed filename, so the hero's URL
      // (sealion6-<hash>.glb, see Car3DHero) is a new path whenever the model
      // changes — the bulletproof cache-bust the user asked for. The plain
      // public/ copy is still shipped as a harmless fallback.
      name: 'emit-hashed-model',
      generateBundle() {
        if (modelBuf) this.emitFile({ type: 'asset', fileName: `neo3d/models/sealion6-${modelV}.glb`, source: modelBuf })
      },
    },
    {
      // Emit version.json so the running app can detect a new deploy and reload.
      name: 'emit-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ commit }) })
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.svg', 'icons/*.png', 'icons/favicon.ico'],
      manifest: {
        name: isDevSite ? 'BYD SL6 VN (dev)' : 'BYD SL6 VN',
        short_name: isDevSite ? 'SL6 dev' : 'BYD SL6 VN',
        description: 'Remote dashboard & controls for OverDrive',
        theme_color: '#071019',
        background_color: '#071019',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Maskable is cropped to a circle/squircle by the launcher, so this
          // one keeps the logo well inside the safe zone.
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Never cache API calls — only the app shell. Telemetry must always be live.
        navigateFallback: 'index.html',
        // See isDevSite above: without this the prod SW answers dev navigations
        // with prod's shell. Empty on the dev build, which owns that path.
        // The watch (/watch/) and pairing (/pair/) sub-apps and the /misc/
        // diagnostic pages are standalone (no SW of their own), so keep the main
        // SW from answering their navigations with the phone app's shell.
        navigateFallbackDenylist: isDevSite ? [/\/watch\//, /\/pair\//, /\/pair-app\//, /\/misc\//] : [/\/dev\//, /\/watch\//, /\/pair\//, /\/pair-app\//, /\/misc\//],
        globPatterns: ['**/*.{js,css,html,svg,webp,png,ico,woff2}'],
        // neo3d/** is the opt-in 3D hero (three.js + a 2 MB model). It's off by
        // default, so keep it out of the precache for everyone — it's fetched
        // from the network at runtime only once someone turns the model on.
        globIgnores: ['**/watch/**', '**/pair/**', '**/pair-app/**', '**/neo3d/**', '**/misc/**'],
        // Match precached assets even with the ?v=<commit> cache-buster.
        ignoreURLParametersMatching: [/^v$/],
        cleanupOutdatedCaches: true,
        // No runtimeCaching for the 3D model: it is edited often, and a service-
        // worker cache (even StaleWhileRevalidate) kept serving stale copies that
        // masked model updates for a whole saga. The model now loads straight from
        // the network — GitHub Pages' ETag means an unchanged model is a cheap 304,
        // a changed one comes down fresh, and nothing can pin an old render. The
        // retired car3d-model cache is purged on boot (see updater.ts). Re-add
        // caching only once the model has stopped changing.
      }
    })
  ],
  server: { host: true }
  }
})
