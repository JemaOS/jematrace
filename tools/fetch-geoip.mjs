/**
 * Récupère la base GeoIP City Lite (DB-IP, CC BY 4.0) pour l'inclure dans la
 * fonction serverless.
 *
 * Le fichier fait 121 Mo : il n'est pas versionné (GitHub refuse au-delà de
 * 100 Mo) et n'est donc pas présent sur le runner Vercel. On le télécharge au
 * build, une fois par mois, puis `vercel.json` l'inclut dans la fonction.
 *
 * Sans réseau ou en cas d'échec, on continue : la géolocalisation retombe sur
 * `ip-api`, moins précise mais fonctionnelle.
 */

import { gunzipSync } from 'node:zlib';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'packages', 'geo-data', 'geoip');
const target = join(dir, 'dbip-city-lite.mmdb');

const MIN_BYTES = 50 * 1024 * 1024;

if (!process.env.VERCEL && !process.argv.includes('--force')) {
  console.log('[geoip] hors Vercel : rien à faire');
  process.exit(0);
}

if (existsSync(target) && statSync(target).size > MIN_BYTES) {
  console.log('[geoip] base déjà présente');
  process.exit(0);
}

/** Mois à essayer : le courant puis les trois précédents. */
function months() {
  const out = [];
  const now = new Date();
  for (let back = 0; back < 4; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

mkdirSync(dir, { recursive: true });

for (const month of months()) {
  const url = `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`;
  try {
    console.log(`[geoip] téléchargement ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) {
      console.log(`[geoip] ${res.status} — mois suivant`);
      continue;
    }
    const gz = Buffer.from(await res.arrayBuffer());
    const mmdb = gunzipSync(gz);
    if (mmdb.length < MIN_BYTES) {
      console.log('[geoip] fichier suspect, ignoré');
      continue;
    }
    writeFileSync(target, mmdb);
    console.log(`[geoip] ${month} : ${Math.round(mmdb.length / 1024 / 1024)} Mo écrits`);
    process.exit(0);
  } catch (e) {
    console.log(`[geoip] échec ${month} : ${String(e).slice(0, 80)}`);
  }
}

console.log('[geoip] base indisponible : la géolocalisation passera par ip-api');
process.exit(0);