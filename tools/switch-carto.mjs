/** Remplace les tuiles Esri (trous de couverture) par CARTO Dark Matter. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(process.cwd(), 'apps', 'web', 'src', 'Map2D.tsx');
let src = readFileSync(FILE, 'utf8');
let hits = 0;

const urls = [...src.matchAll(/'https:\/\/server\.arcgisonline\.com[^']*'/g)];
if (urls.length >= 1) {
  src = src.replace(urls[0][0], "'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'");
  hits += 1;
}
if (urls.length >= 2) {
  src = src.replace(urls[1][0], "'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'");
  hits += 1;
}

const attribLine = /const ATTRIB = '&copy; <a href="https:\/\/www\.esri\.com\/">Esri<\/a>';/;
if (attribLine.test(src)) {
  src = src.replace(
    attribLine,
    "const ATTRIB = '&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> &copy; <a href=\"https://carto.com/attributions\">CARTO</a>';",
  );
  hits += 1;
}

src = src.replace('L.tileLayer(ESRI_BASE, { attribution: ATTRIB, maxZoom: 10, noWrap: true })', 'L.tileLayer(ESRI_BASE, { attribution: ATTRIB, maxZoom: 19, noWrap: true })');
src = src.replace('L.tileLayer(ESRI_LABELS, { maxZoom: 10, opacity: 0.9, noWrap: true })', 'L.tileLayer(ESRI_LABELS, { maxZoom: 19, opacity: 0.9, noWrap: true })');

writeFileSync(FILE, src);
console.log(`remplacements: ${hits}`);
console.log(src.split('\n').filter((l) => /cartocdn|const ATTRIB/.test(l)).join('\n'));
