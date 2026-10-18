/**
 * Point d'entrée serverless (Vercel).
 *
 * La même application Fastify que le serveur local est réutilisée : elle est
 * construite une seule fois par instance, puis chaque requête est confiée au
 * serveur Node sous-jacent. Aucun `listen` ici : Vercel fournit la requête.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import { buildApp } from '../apps/server/src/app.js';

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  app ??= await buildApp();
  await app.ready();
  app.server.emit('request', req, res);
}