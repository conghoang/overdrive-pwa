# OverDrive PWA

A mobile-first Progressive Web App — a cleaner phone frontend for the
[OverDrive](https://github.com/yash-srivastava/Overdrive-release) head-unit backend.
Standalone: host it anywhere, then point it at your car's tunnel/LAN URL. Design
language inspired by Kim Launcher's PWA (deep-navy dark theme, teal accent).

## Stack

- **Preact + TypeScript + Vite**
- `@preact/signals` for state
- `vite-plugin-pwa` for installability + offline app shell
- No backend of its own — talks directly to OD's HTTP API

## How it connects

On first run you enter:

- **Car URL** — your cloudflared/zrok tunnel, or `http://192.168.x.x:8080` on the same Wi-Fi
- **Device token** — the same token OverDrive's web login uses

It calls `POST /auth/token` → stores the returned JWT + URL in `localStorage`
(keys `odpwa.baseUrl`, `odpwa.jwt`). Every request then sends
`Authorization: Bearer <jwt>`. A `401` drops you back to the setup screen.

OD's CORS is `*`, so cross-origin from a hosted PWA works. Telemetry is polled
from `GET /status` every 5s (60s when the tab is hidden); controls read
`GET /api/vehicle/state` and write `POST /api/vehicle/*`.

## Develop

```bash
npm install
npm run dev        # vite dev server (LAN-accessible)
npm run build      # type-check + production build to dist/
npm run preview    # serve the built app
```

Because the backend allows CORS and Bearer auth, `npm run dev` on your laptop can
talk to a real car over its tunnel with no proxy.

## Deploy

`npm run build` produces a static `dist/` — drop it on Vercel / Netlify /
GitHub Pages / Cloudflare Pages, or serve it from anywhere. Open it on your phone
and "Add to Home Screen" to install.

## Implemented

- **Setup / pairing** — URL + token, persisted
- **Vehicle dashboard** — SOC ring, range, charging, SOH, cabin temp, network,
  12V, door/window/climate status, GPS + Maps link
- **Controls** — lock / unlock (hold) / flash / find-car / trunk (hold),
  climate on-off + temp, windows (vent/open/close), charge-limit cap

## Roadmap (not yet built)

- Live camera (H.264 over `ws://host/ws?token=` via WebCodecs)
- Trips & energy history (charts) from `/api/trips`, `/api/performance`
- Seats, lights, cluster-cast, surveillance
