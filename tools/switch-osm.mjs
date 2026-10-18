/** Tuiles OSM (sans clé) + filtre CSS pour un rendu sombre. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'apps', 'web', 'src');
const MAP = join(SRC, 'Map2D.tsx');
const CSS = join(SRC, 'styles.css');

let map = readFileSync(MAP, 'utf8');

map = map.replace(
  /'https:\/\/\{s\}\.basemaps\.cartocdn\.com\/dark_nolabels\/\{z\}\/\{x\}\/\{y\}\{r\}\.png'/,
  "'https://tile.openstreetmap.org/{z}/{x}/{y}.png'",
);
map = map.replace(
  /'https:\/\/\{s\}\.basemaps\.cartocdn\.com\/dark_only_labels\/\{z\}\/\{x\}\/\{y\}\{r\}\.png'/,
  "'https://tile.openstreetmap.org/{z}/{x}/{y}.png'",
);
map = map.replace(
  /const ATTRIB = '&copy; <a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap<\/a> &copy; <a href="https:\/\/carto\.com\/attributions">CARTO<\/a>';/,
  "const ATTRIB = '&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors';",
);
// Une seule couche : OSM inclut déjà les libellés.
map = map.replace(
  /\n    L\.tileLayer\(ESRI_LABELS[^\n]*\n/,
  '\n',
);

writeFileSync(MAP, map);

let css = readFileSync(CSS, 'utf8');
css = css.replace(
  /\.map2d \.leaflet-tile-pane \{[^}]*\}/,
  `.map2d .leaflet-tile-pane {
  /* OSM clair -> carte sombre (aucune cle API). */
  filter: invert(1) hue-rotate(185deg) brightness(0.72) saturate(1.5) contrast(0.95);
}`,
);
writeFileSync(CSS, css);

console.log(map.split('\n').filter((l) => /openstreetmap|tileLayer/.test(l)).join('\n'));
console.log('---');
console.log(css.split('\n').filter((l) => /invert\(1\)/.test(l)).join('\n'));
