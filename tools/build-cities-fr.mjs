/**
 * Construit `data/geo/cities-fr.json` depuis GeoNames (FR.txt, CC BY 4.0) :
 * lieux habités (feature class P) de plus de 1 000 habitants.
 *   [ [nom, lat, lon, population], … ] trié par population décroissante.
 *
 * Sert au recalage de l'ancre sur une commune réelle (Cannes, Antibes…),
 * que le jeu Natural Earth ne contient pas.
 *
 * Usage : node tools/build-cities-fr.mjs
 */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'data', 'geo', 'FR.txt');
const OUT = join(process.cwd(), 'data', 'geo', 'cities-fr.json');

const rows = [];
const rl = createInterface({ input: createReadStream(SRC, 'utf8'), crlfDelay: Infinity });

for await (const line of rl) {
  const f = line.split('\t');
  if (f.length < 15) continue;
  if (f[6] !== 'P') continue; // populated place (colonne 6 = classe)
  const name = f[1];
  const lat = Number.parseFloat(f[4]);
  const lon = Number.parseFloat(f[5]);
  const pop = Number.parseInt(f[14] || '0', 10);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(pop)) continue;
  if (pop < 1000) continue;
  rows.push([name, Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, pop]);
}

rows.sort((a, b) => b[3] - a[3]);
writeFileSync(OUT, JSON.stringify(rows));

console.log(`${rows.length} communes → ${Math.round(readFileSync(OUT).length / 1024)} Ko`);
for (const want of ['Cannes', 'Antibes', 'Grasse', 'Le Rouret', 'Nice']) {
  const hit = rows.find((r) => r[0] === want);
  console.log(`  ${want}: ${hit ? JSON.stringify(hit) : 'absent'}`);
}
