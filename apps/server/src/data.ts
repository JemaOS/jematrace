/**
 * Localisation des fichiers de données, quel que soit le contexte d'exécution.
 *
 * Trois cas :
 *  1. serveur local (`tsx src/index.ts`) : les fichiers sont à côté du module ;
 *  2. serveur compilé (`dist/`) : un niveau plus haut ;
 *  3. fonction serverless (Vercel) : le code est regroupé ailleurs, mais les
 *     fichiers inclus le sont à leur chemin relatif depuis la racine du projet,
 *     qui est aussi le répertoire courant.
 *
 * `GEOTRACE_DATA_DIR` force la racine si besoin.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racines candidates, dans l'ordre de préférence. */
function roots(fromModuleUrl: string): string[] {
  const roots: string[] = [];
  const forced = process.env.GEOTRACE_DATA_DIR;
  if (forced) roots.push(forced);

  // À côté du module (développement) puis un cran au-dessus (dist/).
  // En serverless, `import.meta.url` peut être réécrit par le bundler : on
  // n'échoue jamais à cause de lui.
  try {
    const moduleDir = fileURLToPath(new URL('.', fromModuleUrl));
    roots.push(moduleDir, join(moduleDir, '..'));
  } catch {
    // URL inexploitable : les racines ci-dessous suffisent.
  }

  // Depuis le répertoire courant (serverless, monorepo).
  roots.push(process.cwd(), join(process.cwd(), '..'), join(process.cwd(), '..', '..'));

  return roots;
}

/**
 * Renvoie le premier chemin existant pour `rel` (relatif à la racine du dépôt),
 * ou `null`.
 */
export function findDataFile(rel: string, fromModuleUrl: string): string | null {
  if (isAbsolute(rel)) return existsSync(rel) ? rel : null;

  for (const root of roots(fromModuleUrl)) {
    const candidate = join(root, rel);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}