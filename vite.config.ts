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

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'OverDrive',
        short_name: 'OverDrive',
        description: 'Remote dashboard & controls for OverDrive',
        theme_color: '#071019',
        background_color: '#071019',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Never cache API calls — only the app shell. Telemetry must always be live.
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}']
      }
    })
  ],
  server: { host: true }
})
