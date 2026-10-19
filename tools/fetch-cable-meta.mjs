/**
 * Télécharge les métadonnées des câbles sous-marins depuis l'API publique de
 * TeleGeography (même source que notre `cables.geo.json`, CC BY-NC-SA).
 *
 * Notre géométrie ne contient que `name` + `points`. La fiche d'un câble
 * (propriétaires, fournisseur, année de mise en service, longueur, points
 * d'atterrissage, lien officiel) est récupérée ici une fois pour toutes et
 * versionnée dans `apps/web/public/world/cable-meta.json`.
 *
 * Usage : node tools/fetch-cable-meta.mjs [--force]
 */

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps', 'web', 'public', 'world', 'cable-meta.json');
const API = 'https://www.submarinecablemap.com/api/v3/cable';

const force = process.argv.includes('--force');

if (existsSync(OUT) && !force) {
  console.log('[cable-meta] fichier déjà présent (utilisez --force pour le refaire)');
  process.exit(0);
}

const headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
  accept: 'application/json',
};

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {
      // nouvelle tentative
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
}

const list = await getJson(`${API}/all.json`);
if (!Array.isArray(list)) {
  console.error('[cable-meta] liste indisponible');
  process.exit(1);
}
console.log(`[cable-meta] ${list.length} câbles à interroger`);

const meta = {};
let done = 0;
let failed = 0;

const queue = list.slice();
async function worker() {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const detail = await getJson(`${API}/${item.id}.json`);
    if (detail) {
      meta[detail.name ?? item.name] = {
        id: detail.id,
        name: detail.name ?? item.name,
        length: detail.length ?? null,
        owners: detail.owners ?? null,
        suppliers: detail.suppliers ?? null,
        rfs: detail.rfs ?? null,
        rfsYear: detail.rfs_year ?? null,
        landingPoints: Array.isArray(detail.landing_points)
          ? detail.landing_points.map((lp) => ({ name: lp.name, country: lp.country ?? null }))
          : [],
        url: detail.url ?? null,
        notes: detail.notes ?? null,
      };
    } else {
      failed += 1;
    }
    done += 1;
    if (done % 100 === 0) console.log(`[cable-meta] ${done}/${list.length} (${failed} échecs)`);
  }
}

await Promise.all(Array.from({ length: 10 }, worker));

const sorted = Object.fromEntries(Object.entries(meta).sort((a, b) => a[0].localeCompare(b[0])));
await writeFile(OUT, JSON.stringify(sorted), 'utf8');
console.log(`[cable-meta] ${Object.keys(sorted).length} fiches écrites, ${failed} échecs → ${OUT}`);
