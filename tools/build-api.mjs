/**
 * Compile la fonction serverless en un bundle autonome.
 *
 * Vercel compile bien `api/index.ts`, mais conserve les imports `@jematrace/*`
 * (paquets du monorepo) comme externes : au runtime, `node_modules` n'existe
 * pas dans `/var/task` et la fonction plante. On produit donc ici un fichier
 * unique contenant tout le graphe (paquets du workspace, Fastify, MaxMind),
 * que Vercel se contente d'inclure.
 *
 * Format ESM : le code résout ses fichiers de données avec `import.meta.url`,
 * indisponible en CommonJS.
 */

import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(root, 'api', 'entry.ts')],
  outfile: join(root, 'api', 'bundle.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Les dépendances CommonJS appellent `require()` : en ESM, il faut le
  // reconstruire, sinon `Dynamic require of "node:events" is not supported`.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  // Les dépendances CommonJS sont converties, y compris MaxMind.
  logLevel: 'info',
});

console.log('[build-api] api/entry.ts → api/bundle.mjs');