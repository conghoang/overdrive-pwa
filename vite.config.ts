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

// Content hash of the 3D model, appended as ?v= to its URL. The service worker
// caches the 2 MB GLB CacheFirst (see runtimeCaching below), so without a per-
// content key a model update would never reach anyone who'd cached the old one;
// with it, the GLB is re-downloaded ONLY when its bytes change, not every deploy.
// The hash is computed in a plain-JS helper (no @types/node in this project; see
// build-watch above) and resolved before the config object is built.
const modelHashHelper = './scripts/model-hash.mjs'


export default defineConfig(async (): Promise<UserConfig> => {
  const { modelHash } = await import(/* @vite-ignore */ modelHashHelper)
  const modelV: string = modelHash('public/neo3d/models/sealion6.glb') || commit

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
        navigateFallbackDenylist: isDevSite ? [/\/watch\//, /\/pair\//, /\/misc\//] : [/\/dev\//, /\/watch\//, /\/pair\//, /\/misc\//],
        globPatterns: ['**/*.{js,css,html,svg,webp,png,ico,woff2}'],
        // neo3d/** is the opt-in 3D hero (three.js + a 2 MB model). It's off by
        // default, so keep it out of the precache for everyone — it's fetched
        // from the network at runtime only once someone turns the model on.
        globIgnores: ['**/watch/**', '**/pair/**', '**/neo3d/**', '**/misc/**'],
        // Match precached assets even with the ?v=<commit> cache-buster.
        ignoreURLParametersMatching: [/^v$/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // The opt-in 3D hero's heavy, rarely-changing bytes: the ~2 MB car
            // model and the ~0.9 MB three.js runtime. These are in globIgnores
            // above (never precached, so non-users pay nothing), but once a user
            // turns the hero on we DON'T want to re-pull 3 MB over mobile data on
            // every view. CacheFirst = fetched once, then served from the SW cache
            // forever (offline included) with no network, no re-download.
            //   - The model URL carries ?v=<content-hash> (see modelV), so a new
            //     model busts its own entry and is the only thing re-downloaded.
            //   - The vendored three.js is stable; bump this cacheName if you ever
            //     upgrade it, so clients pick up the new runtime.
            //   - The small hero.js / car3d.js / icons.svg / hero.css are left OUT
            //     of this rule on purpose, so hero-logic fixes still reach everyone
            //     through normal HTTP revalidation instead of sitting stale here.
            urlPattern: /\/neo3d\/(models|vendor)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'neo3d-assets',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      }
    })
  ],
  server: { host: true }
  }
})
