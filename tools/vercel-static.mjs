/**
 * Sur Vercel, le projet est détecté comme « autre » : le dossier statique servi
 * à la racine est `public/`. On y recopie le build Vite, ce qui laisse les
 * fonctions de `api/` actives (avec `outputDirectory` défini, elles ne sont
 * plus routées).
 *
 * Exécuté uniquement quand la variable `VERCEL` est présente.
 */

import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.VERCEL) {
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'apps', 'web', 'dist');
const to = join(root, 'public');

if (!existsSync(from)) {
  console.error(`[vercel-static] build introuvable : ${from}`);
  process.exit(1);
}

/*
 * Donnees chargees a l'execution : si l'une manque, la fonctionnalite
 * correspondante disparait sans erreur visible (fiches de cables vides, par
 * exemple). Le build echoue ici plutot que de livrer une app amputee.
 */
const required = [
  'world/world-110m.json',
  'world/cities.json',
  'world/cities-named.json',
  'world/cables.geo.json',
  'world/cable-meta.json',
  'world/year-summaries.json',
];
const missing = required.filter((file) => !existsSync(join(from, ...file.split('/'))));
if (missing.length > 0) {
  console.error(`[vercel-static] donnees absentes du build : ${missing.join(', ')}`);
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('[vercel-static] apps/web/dist → public/');