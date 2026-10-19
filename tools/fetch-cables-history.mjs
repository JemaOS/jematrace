/**
 * Construit le jeu de données des câbles sous-marins, de 1858 à aujourd'hui.
 *
 * Source : `data.map.kmcd.dev` (kmcd.dev), qui agrège TeleGeography,
 * SubmarineNetworks et des cartes d'archives pour la période télégraphique.
 * Les fichiers bruts pèsent 2,9 Mo ; on les allège ici :
 *
 *  - coordonnées arrondies à 3 décimales (~100 m, largement suffisant au
 *    niveau mondial) ;
 *  - seules les propriétés utiles sont conservées ;
 *  - les lignes multiples (MultiLineString) sont gardées telles quelles.
 *
 * Produit :
 *   apps/web/public/world/cables.geo.json     géométrie + années
 *   apps/web/public/world/cable-meta.json     fiches (propriétaires, capacité…)
 *   apps/web/public/world/year-summaries.json récits année par année
 *
 * Usage : node tools/fetch-cables-history.mjs [--force]
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps', 'web', 'public', 'world');
const BASE = 'https://data.map.kmcd.dev';

const force = process.argv.includes('--force');
const geoFile = join(OUT, 'cables.geo.json');

if (existsSync(geoFile) && !force) {
  console.log('[cables] déjà présent (utilisez --force pour régénérer)');
  process.exit(0);
}

const headers = { 'user-agent': 'Mozilla/5.0 (compatible; JemaTrace build)' };

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return await res.json();
    } catch {
      // nouvelle tentative
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`téléchargement impossible : ${url}`);
}

const round = (n) => Math.round(n * 1000) / 1000;

const [features, summaries] = await Promise.all([
  getJson(`${BASE}/all_cables.json`),
  getJson(`${BASE}/year-summaries.json`).catch(() => ({})),
]);

if (!Array.isArray(features)) throw new Error('format inattendu');

const cables = [];
const meta = {};
const landings = new Map();
let points = 0;

for (const feature of features) {
  const p = feature.properties ?? {};
  const name = p.name ?? p.id ?? 'Câble sans nom';
  const year = Number.parseInt(p.rfs_year, 10) || 0;
  const end = Number.parseInt(p.decommission_year, 10) || null;

  const lines = [];
  const geometry = feature.geometry;
  const rawLines =
    geometry?.type === 'MultiLineString'
      ? geometry.coordinates
      : geometry?.type === 'LineString'
        ? [geometry.coordinates]
        : [];

  for (const line of rawLines) {
    if (!Array.isArray(line) || line.length < 2) continue;
    const pts = line
      .filter((c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      .map(([lon, lat]) => [round(lon), round(lat)]);
    if (pts.length >= 2) {
      lines.push(pts);
      points += pts.length;
    }
  }

  if (lines.length === 0) continue;

  cables.push({ name, year, end, lines });

  // Fiche : la première occurrence d'un nom l'emporte, sauf si la suivante
  // apporte une description et pas la première.
  const previous = meta[name];
  if (!previous || (!previous.description && p.description)) {
    meta[name] = {
      name,
      year,
      end,
      owners: p.owners ?? null,
      suppliers: p.suppliers ?? null,
      length: p.length ?? null,
      capacity: p.capacity ?? null,
      rfs: p.rfs_year ? String(p.rfs_year) : null,
      url: p.url ?? null,
      description: p.description ?? null,
      // Coordonnées conservées : la fiche permet de survoler un atterrissage.
      landingPoints: Array.isArray(p.landing_points)
        ? p.landing_points
            .filter((lp) => lp && lp.name)
            .map((lp) => ({
              name: lp.name,
              country: lp.country ?? null,
              lat: Number.isFinite(lp.lat) ? Number(lp.lat) : null,
              lon: Number.isFinite(lp.lng) ? Number(lp.lng) : null,
            }))
        : [],
      /** Technologie : 	ype fourni par la source, sinon déduit de l'année. */
      technology: p.type ?? null,
    };
  }

  for (const lp of p.landing_points ?? []) {
    if (!lp?.id || landings.has(lp.id)) continue;
    if (!Number.isFinite(lp.lat) || !Number.isFinite(lp.lng)) continue;
    landings.set(lp.id, { id: lp.id, name: lp.name, country: lp.country ?? null, lat: lp.lat, lon: lp.lng });
  }
}

cables.sort((a, b) => a.year - b.year);

const years = cables.map((c) => c.year).filter((y) => y > 0);
const minYear = Math.min(...years);
const maxYear = Math.max(...years);

await mkdir(OUT, { recursive: true });
await writeFile(geoFile, JSON.stringify({ minYear, maxYear, cables, landings: [...landings.values()] }), 'utf8');
await writeFile(join(OUT, 'cable-meta.json'), JSON.stringify(meta), 'utf8');
await writeFile(join(OUT, 'year-summaries.json'), JSON.stringify(summaries), 'utf8');

console.log(
  `[cables] ${cables.length} câbles, ${points} points, ${landings.size} atterrissages, ${minYear}–${maxYear}`,
);
console.log(`[cables] récits : ${Object.keys(summaries).length} années documentées`);