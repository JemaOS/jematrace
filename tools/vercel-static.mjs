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

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('[vercel-static] apps/web/dist → public/');