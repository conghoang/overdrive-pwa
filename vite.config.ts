import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

declare const process: { env: Record<string, string | undefined> }

// Standalone PWA: served from anywhere, talks to the OverDrive head-unit backend
// over its tunnel / LAN URL (stored in localStorage). CORS on the backend is `*`
// and auth is a Bearer JWT, so cross-origin requests work fine.
// GitHub Pages project site is served under /<repo>/. Override with
// BASE_PATH=/ for root deploys (custom domain / user page / same-origin car).
const base = process.env.BASE_PATH ?? '/overdrive-pwa/'

// Commit hash (from CI's GITHUB_SHA / VITE_COMMIT). Appended as a ?v= query to
// the app's asset URLs so each deploy busts caches — without renaming files.
const commit = (process.env.VITE_COMMIT || process.env.GITHUB_SHA || 'dev').slice(0, 7)

export default defineConfig({
  base,
  define: { __COMMIT__: JSON.stringify(commit) },
  plugins: [
    preact(),
    {
      // Append ?v=<commit> to local <script src> / <link href> js|css in index.html.
      name: 'asset-version-query',
      enforce: 'post',
      transformIndexHtml(html) {
        return html.replace(/(\b(?:src|href)=")(\/[^"]+\.(?:js|css))"/g, `$1$2?v=${commit}"`)
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
        name: 'BYD SL6 VN',
        short_name: 'BYD SL6 VN',
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
        globPatterns: ['**/*.{js,css,html,svg,webp,png,ico,woff2}'],
        // Match precached assets even with the ?v=<commit> cache-buster.
        ignoreURLParametersMatching: [/^v$/],
        cleanupOutdatedCaches: true,
      }
    })
  ],
  server: { host: true }
})
