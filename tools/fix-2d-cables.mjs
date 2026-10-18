/** 2D : le bouton « Câbles sous-marins » contrôle vraiment l'affichage ; retire Méthodologie/Contact. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'apps', 'web', 'src');

/* ------------------------------------------------------------------ Map2D */
const MAP = join(SRC, 'Map2D.tsx');
let map = readFileSync(MAP, 'utf8');
let mHits = 0;

const mapEdits = [
  [
    'export function Map2D({\n  hops,\n  limit,\n  topo,\n}: {\n  hops: InspectHop[];\n  limit?: number;\n  topo: boolean;\n}) {',
    'export function Map2D({\n  hops,\n  limit,\n  topo,\n  showCables,\n}: {\n  hops: InspectHop[];\n  limit?: number;\n  topo: boolean;\n  showCables: boolean;\n}) {',
  ],
  [
    "    pane.style.visibility = topo ? 'hidden' : 'visible';\n  }, [topo]);",
    "    pane.style.visibility = topo || !showCables ? 'hidden' : 'visible';\n  }, [topo, showCables]);",
  ],
];
for (const [from, to] of mapEdits) {
  if (map.includes(from)) {
    map = map.replace(from, to);
    mHits += 1;
  }
}
writeFileSync(MAP, map);

/* -------------------------------------------------------------------- App */
const APP = join(SRC, 'App.tsx');
let app = readFileSync(APP, 'utf8');
let aHits = 0;

const appEdits = [
  ['<Map2D hops={mapHopsWithClient} limit={Math.min(shown, mapHops.length)} topo={prefs.route === \'topo\'} />',
   '<Map2D hops={mapHopsWithClient} limit={Math.min(shown, mapHops.length)} topo={prefs.route === \'topo\'} showCables={prefs.cables} />'],
];
for (const [from, to] of appEdits) {
  if (app.includes(from)) {
    app = app.replace(from, to);
    aHits += 1;
  }
}

// Supprime les boutons Méthodologie et Contact.
const lines = app.split('\n');
const kept = lines.filter(
  (l) => !l.includes("setModal('method')") && !l.includes("setModal('contact')"),
);
app = kept.join('\n');
writeFileSync(APP, app);

console.log(`Map2D: ${mHits}/2, App: ${aHits}/1, boutons retirés`);
