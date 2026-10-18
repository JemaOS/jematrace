/**
 * Point d'entrée serverless (Vercel).
 *
 * La même application Fastify que le serveur local est réutilisée : elle est
 * construite une seule fois par instance, puis chaque requête est confiée au
 * serveur Node sous-jacent. Aucun `listen` ici : Vercel fournit la requête.
 *
 * Vercel ne traite pas les noms de fichiers entre crochets (`[...path].ts`)
 * comme des routes dynamiques hors framework Next : `vercel.json` réécrit donc
 * `/api/*` et `/s/*` vers ce fichier en transportant le chemin d'origine dans
 * `?__path=`. On le restaure ici pour que Fastify route normalement.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import { buildApp } from '../apps/server/src/app.js';

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  const virtual = url.searchParams.get('__path');

  if (virtual) {
    url.searchParams.delete('__path');
    const query = url.searchParams.toString();
    req.url = virtual + (query ? `?${query}` : '');
  }

  app ??= await buildApp();
  await app.ready();
  app.server.emit('request', req, res);
}