/**
 * Importe les données publiques du monde utilisées par le site de référence
 * (câbles sous-marins TeleGeography, CC BY-NC-SA — usage non commercial avec
 * attribution ; liste de villes), et les convertit aux formats du projet.
 *
 * Entrées  : <TEMP>/kilo/world/{cables-full.json,bigcities.json}
 * Sorties  : apps/web/public/world/cables.geo.json
 *            apps/web/public/world/cities.json
 *            data/cables/cables.json
 *
 * Usage : node tools/import-world.mjs [dossierSource]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2] ?? 'C:/Users/Jema/AppData/Local/Temp/kilo/world';
const ROOT = process.cwd();

function parseGeometry(str) {
  const clean = str.replace(/^LINESTRING\s*\(/i, '').replace(/\)\s*$/, '').trim();
  const pts = [];
  for (const pair of clean.split(/\s+/)) {
    if (!pair) continue;
    const [lonStr, latStr] = pair.split(',');
    const lon = Number(lonStr);
    const lat = Number(latStr);
    if (Number.isFinite(lon) && Number.isFinite(lat)) pts.push([lon, lat]);
  }
  return pts;
}

const rawCables = JSON.parse(readFileSync(join(SRC, 'cables-full.json'), 'utf8'));

let totalPoints = 0;
const cables = [];

/**
 * Nettoie une polyligne : retire le point (0,0) — artefact classique — et
 * coupe aux sauts de plus de 5° (~550 km), qui sont des trous dans la donnée
 * et non des câbles. Sans ça, on trace des droites à travers l'océan.
 */
function cleanSegments(points) {
  const out = [];
  let cur = [];
  const flush = () => {
    if (cur.length > 1) out.push(cur);
    cur = [];
  };
  for (const p of points) {
    // Seul le point (0,0) est un artefact. Les grands ecarts sont des
    // traversées oceaniques legitimes : il ne faut PAS les couper.
    if (p[0] === 0 && p[1] === 0) {
      flush();
      continue;
    }
    cur.push(p);
  }
  flush();
  return out;
}

for (const c of rawCables) {
  const name = c.name ?? c.id ?? 'câble';
  // Chaque élément de `geometry` est une polyligne indépendante : ne jamais les
  // recoller, sinon on crée des segments droits à travers la carte.
  for (const seg of c.geometry ?? []) {
    for (const pts of cleanSegments(parseGeometry(seg))) {
      totalPoints += pts.length;
      cables.push({ name, points: pts });
    }
  }
}

// Points d'atterrissage (dédupliqués par identifiant).
const landingMap = new Map();
for (const c of rawCables) {
  for (const l of c.landing ?? []) {
    if (!l || !Number.isFinite(l.la) || !Number.isFinite(l.lo)) continue;
    const key = l.id ?? `${l.la},${l.lo}`;
    if (!landingMap.has(key)) {
      landingMap.set(key, { id: key, name: l.id ?? '', country: l.country ?? '', lat: l.la, lon: l.lo });
    }
  }
}
const landings = [...landingMap.values()];

const outDir = join(ROOT, 'apps', 'web', 'public', 'world');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'cables.geo.json'), JSON.stringify({ cables, landings }));

const serverDir = join(ROOT, 'data', 'cables');
mkdirSync(serverDir, { recursive: true });
writeFileSync(join(serverDir, 'cables.json'), JSON.stringify({ cables }));

// Villes : la liste du site est déjà triée par population décroissante.
const rawCities = JSON.parse(readFileSync(join(SRC, 'bigcities.json'), 'utf8'));
const cities = rawCities
  .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  .map((p) => [p[0], p[1], 0]);
writeFileSync(join(outDir, 'cities.json'), JSON.stringify(cities));

console.log(`polylignes: ${cables.length}, points: ${totalPoints}, atterrissages: ${landings.length}`);
console.log(`cables.geo.json: ${Math.round(readFileSync(join(outDir, 'cables.geo.json')).length / 1024)} Ko`);
console.log(`cities.json: ${cities.length} villes`);
