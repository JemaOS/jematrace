# JemaTrace

**Visualisez n'importe quel traceroute sur un globe 3D ou une carte 2D.**

JemaTrace prend la sortie d'un `traceroute`, `tracert`, `mtr` ou `tracepath` que vous
collez, la géolocalise, et dessine le trajet dans l'espace : arcs colorés par vitesse,
réseau de câbles sous-marins, lumières des villes, 11 apparences.

Aucune sonde, aucun compte, aucune inscription : la mesure vient de **votre** machine.

**Démo en ligne : <https://jematrace.vercel.app>**

<p align="center">
  <img src="apps/web/public/icon.svg" width="96" alt="JemaTrace">
</p>

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Comment ça marche](#comment-ça-marche)
- [Architecture](#architecture)
- [API](#api)
- [Configuration](#configuration)
- [Données et licences des données](#données-et-licences-des-données)
- [Déploiement](#déploiement)
- [Scripts](#scripts)
- [Contribuer](#contribuer)
- [Licence](#licence)

---

## Fonctionnalités

### Carte et globe
- **Globe 3D** (three.js / React Three Fiber) : continents Natural Earth, câbles sous-marins,
  villes lumineuses, étoiles, tracé progressif saut par saut, photon qui parcourt la route.
- **Carte 2D** (Leaflet) : tuiles vectorielles ou lumières nocturnes NASA, câbles dessinés
  au canevas, noms au survol et **fiche détaillée au clic** (longueur, propriétaires,
  fournisseur, mise en service, points d'atterrissage, lien officiel).
- **Thème clair ou sombre** pour toute l'interface, mémorisé et appliqué avant le
  premier rendu (aucun flash).
- **Frise de l'histoire du réseau** : lecture année par année depuis le premier
  câble (1989) jusqu'au réseau actuel, sur le globe **et** la carte 2D.
- **11 apparences** : Vectoriel, Noir, Noir + Frontières, Atlas, Atlas + Frontières, Nuit,
  Nuit + Frontières, Soleil, Soleil + Frontières, Jour/Nuit, Jour/Nuit + Frontières.
- **Deux modes de tracé** : **Topo** (la route suit les câbles sous-marins) et **Ligne**
  (grands cercles). La distance affichée est la longueur du chemin réellement dessiné.
- **Zoom fluide** : rendu 2D au canevas, résolution 3D adaptative, bloom facultatif.

### Lecture de la trace
- **Panneau des villes** : pays, ville, latence colorée ; clic pour déplier les sauts.
- **Mode geek** : IP, ASN, latence de chaque saut, distance depuis la ville précédente.
- **Échelle de latence** rouge → orange → jaune → vert, vitesse calculée en km/s.
- **Partage** : lien court qui recharge la trace chez celui qui l'ouvre.
- **Historique local** des traces récentes.

### Confort
- **Ouverture sur une démonstration** : la page d'accueil montre tout de suite un résultat.
- **Aide par système** : Windows, Linux, macOS, JemaOS — la commande exacte à coller,
  avec la marche à suivre pour ouvrir le terminal.
- **FR / EN**, PWA installable, thème sombre, aucune donnée personnelle affichée.

---

## Démarrage rapide

Prérequis : **Node.js ≥ 20** et npm (le projet utilise les *workspaces* npm).

```bash
git clone https://github.com/JemaOS/jematrace.git
cd jematrace
npm install
npm run dev
```

| Service | URL |
|---|---|
| Interface | <http://localhost:5173> |
| API | <http://127.0.0.1:8787> |

Collez une sortie de traceroute (ou `Ctrl+V` n'importe où sur la page), puis
**Visualiser !**.

Pour obtenir une trace chez vous :

| Système | Terminal | Commande |
|---|---|---|
| **Windows** | touche Windows → `cmd` | `tracert exemple.com \| clip` |
| **Linux** | terminal (Ctrl+Alt+T) | `traceroute exemple.com \| xclip -sel clip` |
| **macOS** | Terminal (⌘+Espace) | `traceroute exemple.com \| pbcopy` |
| **JemaOS** | shell (Ctrl+Alt+T) | `tracepath exemple.com` |

### Base de géolocalisation (recommandé)

La base GeoIP n'est pas versionnée (121 Mo). Sans elle, le serveur se rabat sur un service
public et la précision baisse. Pour l'activer :

1. Télécharger **DB-IP City Lite** (gratuit, CC BY 4.0) :
   <https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz>
2. Décompresser en `packages/geo-data/geoip/dbip-city-lite.mmdb`.

```bash
# exemple
mkdir -p packages/geo-data/geoip
gunzip -c dbip-city-lite-2026-10.mmdb.gz > packages/geo-data/geoip/dbip-city-lite.mmdb
```

Le fichier des câbles est déjà présent (`data/cables/cables.json`). Sans lui, le mode
**Topo** retombe proprement sur des grands cercles.

---

## Comment ça marche

```
trace collée
   │
   ├─ parse ─────────────► sauts { ttl, ip, rtt }
   │                        traceroute / tracert FR-EN / mtr --report / tracepath
   │
   ├─ enrichir ──────────► DNS inverse (DoH), ASN (RIPEstat), ville + coordonnées (DB-IP)
   │
   ├─ géolocaliser ──────► candidats DNS/GeoIP, ancrage sur l'origine, borne de latence
   │
   ├─ grouper ───────────► une entrée par ville (latence = minimum du groupe)
   │
   └─ mesurer ───────────► distance du chemin, vitesse, couleur par segment
```

### Les formules (identiques au site de référence)

| Grandeur | Formule |
|---|---|
| Vitesse d'un segment | `km × 2000 / ΔRTT_ms` |
| Vitesse du chemin | `2000 × distance / RTT du dernier saut qui répond` |
| Compensation sauts courts | `× (1 + 1500 / km)` |
| Paliers de couleur | `0 #ff4d4d` · `40 000 #ff9e2c` · `90 000 #ffe14d` · `150 000 #8adc4e` · `210 000 #aeff71` |
| Vitesse inconnue | `#8b949e` |

Sur un vrai `tracert` : sans inférence **44 634 km**, avec **11 337 km** — la géolocalisation
naïve cumule des allers-retours qui n'existent pas.

### Mode Topo

Un graphe des câbles sous-marins est construit à partir de `data/cables/cables.json`.
Entre deux villes, un A\* cherche le meilleur chemin dans ce graphe :

- `CABLE_THRESHOLD_KM = 1000` — en dessous, on reste en ligne droite ;
- `CABLE_CONNECT_KM = 300` — écart maximal entre deux tronçons pour les relier ;
- `MAX_INTRA_COUNTRY_KM = 8300` — pas de saut déraisonnable ;
- `LANDING_PENALTY = 3` — un atterrissage coûte cher, on évite les détours absurdes ;
- `CABLE_REACH_KM = 800` — rayon de recherche de l'atterrissage autour d'une ville
  (une ville peut être loin de la mer).

### Rendu

- **3D** : géométries de tubes fusionnées (2 draw calls pour tous les arcs, couleurs par
  sommet), relais et zones de clic instanciés, DPR adaptatif avec plancher à 1×,
  bloom coupé automatiquement si le GPU ne suit pas.
- **2D** : Leaflet tout-canevas, frontières fusionnées en une seule polyligne,
  tuiles préchargées, fond Nuit en lumières nocturnes NASA.

---

## Architecture

```
jematrace/
├── apps/
│   ├── server/              API Fastify (parse → enrich → mesure)
│   │   └── src/
│   │       ├── index.ts     entrée locale (écoute sur 8787)
│   │       ├── app.ts       construction de l'application (réutilisée par Vercel)
│   │       ├── enrich.ts    DNS inverse, ASN, GeoIP, inférence de ville
│   │       └── cables.ts    chargement du graphe de câbles
│   └── web/                 interface React + Vite
│       ├── src/
│       │   ├── Globe.tsx    globe three.js
│       │   ├── Map2D.tsx    carte Leaflet
│       │   ├── Panel.tsx    volet des villes
│       │   ├── looks.ts     les 11 apparences (globe + fond 2D)
│       │   ├── earthTexture.ts  texture équirectangulaire du globe
│       │   └── i18n.ts      FR / EN
│       └── public/          icônes, manifeste, monde et câbles
├── packages/
│   ├── shared/              types partagés
│   ├── traceroute-parse/    analyse des 4 formats
│   ├── seg-speed/           vitesse → couleur
│   ├── geo/                 distances, groupement, inférence
│   ├── cable-routing/       graphe des câbles + A*
│   └── geo-data/            base GeoIP (non versionnée)
├── data/                    câbles, villes, contours
├── api/                     fonction Vercel (déploiement)
└── tools/                   scripts de préparation des données
```

Technologies : **TypeScript strict**, React 18, Vite 5, Leaflet 1.9, three.js 0.169,
Fastify 5, Vitest.

---

## API

Base locale : `http://127.0.0.1:8787`.

### `GET /api/health`

```json
{ "ok": true, "service": "jematrace", "cableNodes": 5895 }
```

### `POST /api/inspect`

```json
{
  "text": "traceroute to exemple.com ...",
  "mode": "topo",
  "clientIp": "203.0.113.10",
  "anchor": { "lat": 43.55, "lon": 7.01 }
}
```

`mode` : `topo` (suit les câbles) ou `line` (grands cercles).
`clientIp` sert d'ancre de géolocalisation pour les premiers sauts ; il n'est jamais
renvoyé si l'on passe uniquement `anchor` (utilisé par la démonstration d'accueil).

Réponse : `{ result, client, hops, format, warnings }` où `result` contient
`target`, `groups`, `segments`, `distanceKm`, `speedKmS`.

### Partage et historique

| Route | Rôle |
|---|---|
| `POST /api/share` | enregistre un texte, renvoie `{ id }` |
| `GET /api/share/:id` | relit un texte partagé |
| `GET /s/:id` | redirige vers `/?share=:id` |
| `POST /api/recent` | ajoute une cible à l'historique |
| `GET /api/recent` | liste les cibles récentes |

> Le partage et l'historique serveur sont **en mémoire** : ils ne survivent pas à un
> redémarrage. L'historique de l'interface est aussi conservé en `localStorage`.

---

## Configuration

Les préférences sont stockées en cookies `gt2_*` :

| Cookie | Valeurs | Effet |
|---|---|---|
| `gt2_view` | `3d` · `2d` | vue par défaut |
| `gt2_route` | `topo` · `line` | mode de tracé |
| `gt2_look` | `vector` · `0` · `1` · `3` · `4` · `5` · `6` · `10` · `11` · `12` · `13` | apparence |
| `gt2_cables` | `0` · `1` | réseau de câbles |
| `gt2_cities` | `0` · `1` | villes |
| `gt2_geek` | `0` · `1` | mode geek |

Le système choisi pour la commande est mémorisé dans `localStorage.gt_os`.

---

## Données et licences des données

| Donnée | Source | Licence |
|---|---|---|
| Contours et villes du monde | [Natural Earth](https://www.naturalearthdata.com/) 110m | domaine public |
| Géolocalisation IP | [DB-IP City Lite](https://db-ip.com/db/lite.php) | CC BY 4.0 (attribution) |
| Câbles sous-marins | [TeleGeography](https://www.submarinecablemap.com/) | CC BY-NC-SA 4.0 — **usage non commercial** |
| Lumières nocturnes 2D | [NASA GIBS](https://earthdata.nasa.gov/gibs) (VIIRS) | domaine public |
| Fond de carte 2D | [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL |
| DNS inverse | Cloudflare DoH | service public |
| ASN | [RIPEstat](https://stat.ripe.net/) | service public |
| Polices | [Inter](https://rsms.me/inter/), [Manrope](https://manropefont.com/) | SIL OFL 1.1 |

Les câbles TeleGeography sont **non commerciaux** : JemaTrace est un projet gratuit et
sans publicité. Si vous réutilisez ce dépôt à des fins commerciales, remplacez ce jeu de
données ou obtenez une licence.

---

## Déploiement

### Vercel (front + API)

Instance publique : **<https://jematrace.vercel.app>**

Le dépôt contient une fonction serverless (`api/`) qui réutilise l'application Fastify.
`npm run build` enchaîne : compilation TypeScript, build Vite, **bundle esbuild** de la
fonction, puis copie du statique dans `public/`.

```bash
npm i -g vercel
vercel link
vercel --prod
```

Trois points spécifiques à Vercel, déjà réglés dans le dépôt :

1. **La fonction est pré-bundlée** (`tools/build-api.mjs` → `api/bundle.mjs`). Vercel
   laisse les paquets du monorepo (`@jematrace/*`) en imports externes et n'embarque pas
   `node_modules` : sans bundle, la fonction plante au démarrage.
2. **Les routes sont réécrites** vers `api/index` avec le chemin d'origine en `?__path=`.
   Hors framework Next, un fichier `api/[...path].ts` n'est pas traité comme une route
   dynamique.
3. **La sortie statique va dans `public/`**, dossier servi à la racine pour un projet
   « autre ». Définir `outputDirectory` désactive le routage des fonctions.

La protection de déploiement doit être désactivée, sinon toutes les URL répondent
« Login – Vercel » (y compris `/api/*`) :

```bash
vercel project protection disable jematrace --sso
```

| Variable | Rôle |
|---|---|
| `GEOTRACE_DATA_DIR` | racine des fichiers de données (par défaut : détection automatique) |

> En production, la base GeoIP n'est pas embarquée (121 Mo) : la géolocalisation passe
> par `ip-api`. Pour la précision maximale, ajoutez `packages/geo-data/geoip/**` aux
> `includeFiles` de la fonction et déposez-y le `.mmdb`.

### Auto-hébergement

```bash
npm run build -w @jematrace/web      # interface statique dans apps/web/dist
npm run start -w @jematrace/server   # API sur le port 8787
```

Servez `apps/web/dist` derrière un reverse proxy et redirigez `/api/*` vers l'API.

---

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | API + interface en développement |
| `npm run dev:api` / `npm run dev:web` | un seul des deux |
| `npm test` | suite Vitest (**74 tests**) |
| `npm run test:watch` | tests en continu |
| `npm run typecheck` | `tsc -b` sur tout le dépôt |
| `npm run clean` | nettoie les sorties de compilation |
| `npm run build -w @jematrace/web` | build de production de l'interface |

---

## Contribuer

Les contributions sont bienvenues — voir [CONTRIBUTING.md](CONTRIBUTING.md).

Idées ouvertes : page « jeu » (deviner la position d'une IP), persistance du partage
(base KV), langues supplémentaires, remplacement du fond de carte par un rendu vectoriel
maison.

---

## Licence

Code sous **MIT** — © 2026 **JemaTechnology**. Voir [LICENSE](LICENSE).

Les jeux de données conservent leurs licences propres (voir le tableau ci-dessus),
notamment les câbles TeleGeography en CC BY-NC-SA (non commercial).