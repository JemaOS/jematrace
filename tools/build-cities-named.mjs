/**
 * Génère `apps/web/public/world/cities-named.json` à partir des lieux peuplés
 * Natural Earth 50m (domaine public) :
 *   [ [nom, lat, lon, population], … ] trié par population décroissante.
 *
 * Sert au sélecteur « point de départ » (ancrage du premier saut).
 * Usage : node tools/build-cities-named.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'data', 'geo');
const src = JSON.parse(readFileSync(join(DIR, 'ne_10m_places.geojson'), 'utf8'));

const rows = [];
for (const feature of src.features) {
  const p = feature.properties ?? {};
  const name = p.NAME ?? p.name;
  const lat = Number(p.LATITUDE ?? p.latitude);
  const lon = Number(p.LONGITUDE ?? p.longitude);
  const pop = Number(p.POP_MAX ?? p.pop_max ?? 0);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  rows.push([String(name), Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, pop]);
}

rows.sort((a, b) => b[3] - a[3]);

writeFileSync(join(DIR, 'cities-named.json'), JSON.stringify(rows));
console.log(`${rows.length} villes nommées → ${Math.round(readFileSync(join(DIR, 'cities-named.json')).length / 1024)} Ko`);
console.log(`3 premières : ${rows.slice(0, 3).map((r) => r[0]).join(', ')}`);
