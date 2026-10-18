/**
 * Compacte les GeoJSON Natural Earth (domaine public) en un seul fichier :
 *   { "land": [ring, ...], "countries": [ring, ...] }
 * où `ring` est une liste de `[lon, lat]` arrondis au millième de degré (~110 m).
 *
 * Usage : node tools/build-world.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DIR = join(process.cwd(), 'data', 'geo');

function ringsOf(geojson) {
  const rings = [];
  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) rings.push(ring);
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates) {
        for (const ring of polygon) rings.push(ring);
      }
    }
  }
  return rings;
}

const round = (ring) => ring.map(([lon, lat]) => [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000]);

const land = ringsOf(JSON.parse(readFileSync(join(DIR, 'ne_110m_land.geojson'), 'utf8')));
const countries = ringsOf(JSON.parse(readFileSync(join(DIR, 'ne_110m_admin_0_countries.geojson'), 'utf8')));

const out = { land: land.map(round), countries: countries.map(round) };

mkdirSync(DIR, { recursive: true });
const target = join(DIR, 'world-110m.json');
writeFileSync(target, JSON.stringify(out));

const points = out.land.reduce((a, r) => a + r.length, 0) + out.countries.reduce((a, r) => a + r.length, 0);
console.log(`land=${out.land.length} rings, countries=${out.countries.length} rings, points=${points}`);
console.log(`${target} → ${Math.round(readFileSync(target).length / 1024)} Ko`);
