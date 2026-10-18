/**
 * Construit `apps/web/public/world/cities.json` à partir des lieux peuplés
 * Natural Earth 50m (domaine public) :
 *   [ [lat, lon, population], … ] trié par population décroissante.
 *
 * Usage : node tools/build-cities.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'data', 'geo');
const src = JSON.parse(readFileSync(join(DIR, 'ne_50m_places.geojson'), 'utf8'));

const rows = [];
for (const feature of src.features) {
  const p = feature.properties ?? {};
  const lat = Number(p.LATITUDE ?? p.latitude);
  const lon = Number(p.LONGITUDE ?? p.longitude);
  const pop = Number(p.POP_MAX ?? p.pop_max ?? 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  rows.push([Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, pop]);
}

rows.sort((a, b) => b[2] - a[2]);

writeFileSync(join(DIR, 'cities.json'), JSON.stringify(rows));
console.log(`${rows.length} villes, plus grande = ${rows[0]?.[2]}, plus petite = ${rows[rows.length - 1]?.[2]}`);
console.log(`écrit ${Math.round(readFileSync(join(DIR, 'cities.json')).length / 1024)} Ko`);
