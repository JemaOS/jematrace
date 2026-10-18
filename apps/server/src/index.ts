/**
 * Entrée locale de l'API : écoute sur le port 8787.
 *
 * L'application elle-même est construite par `buildApp()`, réutilisée telle
 * quelle par la fonction serverless (`api/[...path].ts`) sur Vercel.
 */

import { buildApp } from './app.js';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);

const app = await buildApp();
await app.listen({ port: PORT, host: '127.0.0.1' });
app.log.info(`RouteScope API prête sur http://127.0.0.1:${PORT}`);