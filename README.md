<div align="center">

<p><img src="apps/web/public/icon.svg" width="96" alt="JemaTrace" /></p>

<h1>JemaTrace</h1>

### See any traceroute on a 3D globe or a 2D map

[![Made by Jema Technology](https://img.shields.io/badge/Made%20by-Jema%20Technology-8286ef)](https://www.jematechnology.fr)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![three.js](https://img.shields.io/badge/three.js-globe-000000?logo=threedotjs&logoColor=white)](https://threejs.org)
[![Fastify](https://img.shields.io/badge/Fastify-API-000000?logo=fastify&logoColor=white)](https://fastify.dev)
[![Demo](https://img.shields.io/badge/Live%20demo-jematrace.vercel.app-8286ef)](https://jematrace.vercel.app)

**Paste a `traceroute` / `tracert` / `mtr` / `tracepath` → geolocate it → watch the path glow across a submarine-cable globe.**

▶ **Live demo: [jematrace.vercel.app](https://jematrace.vercel.app)**

[Features](#-features) · [Screenshots](#-screenshots) · [Getting started](#-getting-started) · [Architecture](#-architecture) · [License](#-license)

<br>

<sub>**Keywords:** traceroute · visual traceroute · tracert · mtr · tracepath · network map · 3D globe · hop visualization · latency map · geolocation · AS lookup · submarine cables · network diagnostics · ping path · three.js · React · TypeScript · Fastify</sub>

</div>

![JemaTrace — 3D globe](screenshots/main.png)

---

## ✨ Features

- 🌍 **3D globe & 2D map** — switch between them instantly
- 🧭 **Geolocation** of every hop (city, country, AS)
- 🌈 **Speed-coloured arcs** — latency visualized along the route
- 🧵 **Topo / Line modes** — follow the physical cable layout or a straight line
- 🛰️ **Submarine cable network** — existing, new and decommissioned cables
- 🏙️ **City lights** and multiple visual themes
- 📤 **Share & history** — shareable links, recent traceroutes
- 🔌 **API** — `POST /api/inspect` to parse & enrich a trace
- 🕵️ **No probe, no account** — the measurement comes from *your* machine

---

## 📸 Screenshots

| Light | Dark |
| :---: | :---: |
| <img src="screenshots/main.png" alt="JemaTrace — light" /> | <img src="screenshots/main-dark.png" alt="JemaTrace — dark" /> |

| 2D map | Preferences |
| :---: | :---: |
| <img src="screenshots/map-2d.png" alt="JemaTrace — 2D map of a traceroute" /> | <img src="screenshots/preferences.png" alt="JemaTrace — preferences" /> |

<p align="center">
  <img src="screenshots/about.png" width="880" alt="JemaTrace — about" />
</p>

### 📱 Mobile

| Dark | Light |
| :---: | :---: |
| <img src="screenshots/mobile-dark.png" alt="JemaTrace — mobile, dark" width="300" /> | <img src="screenshots/mobile-light.png" alt="JemaTrace — mobile, light" width="300" /> |

---

## 🚀 Getting started

### Prerequisites
- [Node.js](https://nodejs.org) **20+**

### Run (API + web)

```bash
git clone https://github.com/JemaOS/jematrace.git
cd jematrace
npm install
npm run dev        # API on :8787 + web on :5173
```

The web dev server proxies `/api` to the API (`http://127.0.0.1:8787`).

### Build

```bash
npm run build      # builds the API and the web app
```

### Tests

```bash
npm test           # Vitest
npm run typecheck  # tsc -b
```

---

## 🏗 Architecture

```
apps/
├── web/      # React + Vite + three.js (globe) + Leaflet (2D map)
└── server/   # Fastify API (/api/inspect, /api/share, /api/recent)
packages/
├── traceroute-parse/   # parse traceroute / tracert / mtr / tracepath
├── geo/                # geolocation + AS lookups
├── cable-routing/      # submarine-cable routing
├── seg-speed/          # latency → speed colouring
└── shared/             # shared types
```

**Tech stack:** TypeScript · React · Vite · three.js (`@react-three/fiber`) · Leaflet · Fastify · npm workspaces.

---

## 🤝 Contributing

Contributions are welcome! Fork, branch, and open a pull request.

```bash
git checkout -b feat/my-feature
git commit -m "feat: my feature"
git push origin feat/my-feature
```

---

## 📄 License

Released under the **MIT License** — see [LICENSE](LICENSE).

<div align="center">
Made with ❤️ by <a href="https://www.jematechnology.fr">Jema Technology</a>
</div>
