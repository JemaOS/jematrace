/**
 * Fonction serverless (Vercel).
 *
 * Le corps réel est compilé par `tools/build-api.mjs` en `api/bundle.mjs` :
 * Vercel laisse les paquets du monorepo (`@geotrace/*`) en imports externes et
 * ne les embarque pas, d'où un bundle autonome produit à l'avance.
 */

import handler from './bundle.mjs';

export default handler;