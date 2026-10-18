/** Renomme l'app en RouteScope et retire la mention d'inspiration. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const edits = [
  // Marque visible
  [join(ROOT, 'apps', 'web', 'src', 'App.tsx'), 'Geo<span>Traceroute</span>', 'Route<span>Scope</span>'],
  // Titre et manifeste
  [join(ROOT, 'apps', 'web', 'index.html'), 'GeoTrace — Coller un traceroute', 'RouteScope — Coller un traceroute'],
  [join(ROOT, 'apps', 'web', 'public', 'manifest.webmanifest'), 'GeoTrace — traceroute sur globe', 'RouteScope'],
  [join(ROOT, 'apps', 'web', 'public', 'manifest.webmanifest'), '"short_name": "GeoTrace"', '"short_name": "RouteScope"'],
  // Nom du service côté API
  [join(ROOT, 'apps', 'server', 'src', 'index.ts'), "service: 'geotrace'", "service: 'routescope'"],
  // README
  [join(ROOT, 'README.md'), '# GeoTrace', '# RouteScope'],
];

let total = 0;
for (const [file, from, to] of edits) {
  if (!existsSync(file)) continue;
  let src = readFileSync(file, 'utf8');
  if (src.includes(from)) {
    src = src.split(from).join(to);
    writeFileSync(file, src);
    total += 1;
  }
}

// Retire la ligne de crédits sur l'inspiration.
const app = join(ROOT, 'apps', 'web', 'src', 'App.tsx');
let a = readFileSync(app, 'utf8');
const lines = a.split('\n').filter((l) => !l.includes('Interface inspirée de geotraceroute.com'));
a = lines.join('\n');
writeFileSync(app, a);

console.log(`remplacements: ${total}`);
console.log('--- restes de "Geo" ---');
const files = [
  join(ROOT, 'apps', 'web', 'src', 'App.tsx'),
  join(ROOT, 'apps', 'web', 'index.html'),
  join(ROOT, 'apps', 'web', 'public', 'manifest.webmanifest'),
  join(ROOT, 'apps', 'server', 'src', 'index.ts'),
  join(ROOT, 'README.md'),
];
for (const f of files) {
  if (!existsSync(f)) continue;
  const src = readFileSync(f, 'utf8');
  const hits = src.split('\n').filter((l) => /GeoTrace|Geo<\/span>|geotraceroute\.com/.test(l));
  if (hits.length) console.log(f.replace(ROOT + '\\', ''), hits.slice(0, 5));
}
