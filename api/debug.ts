/** Sonde temporaire : état des fichiers vus par la fonction déployée. */

import { readdirSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const out: Record<string, unknown> = { cwd: process.cwd() };
  const read = (p: string) => {
    try {
      return readFileSync(p, 'utf8').slice(0, 400);
    } catch (e) {
      return `ERR ${(e as NodeJS.ErrnoException).code}`;
    }
  };
  out.task = (() => {
    try {
      return readdirSync('/var/task');
    } catch {
      return 'n/a';
    }
  })();
  out.geoPkgNodeModules = read('/var/task/node_modules/@geotrace/geo/package.json');
  out.geoPkgSource = read('/var/task/packages/geo/package.json');
  out.geoDist = (() => {
    try {
      return readdirSync('/var/task/packages/geo/dist');
    } catch (e) {
      return `ERR ${(e as NodeJS.ErrnoException).code}`;
    }
  })();

  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out, null, 2));
}