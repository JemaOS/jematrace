/**
 * API RouteScope — mode « coller un traceroute ».
 *
 * L'utilisateur fournit la sortie de son propre traceroute.
 * Le serveur parse → enrichit (rDNS, ASN, géolocalisation) → calcule les
 * métriques → renvoie un `TraceResult` prêt à afficher.
 *
 * Les métriques reproduisent celles du site de référence :
 *   distance = somme du chemin dessiné (grands cercles pour l'instant, câbles ensuite)
 *   vitesse  = 2000 × distance / RTT du dernier saut qui répond
 */

import cors from '@fastify/cors';
import {
  computeSegments,
  groupByCity,
  lastRespondingRttMs,
  withRttDeltas,
  type LatLon,
  type RouteMode,
} from '@geotrace/geo';
import { hex, segmentRGB } from '@geotrace/seg-speed';
import type { ResolvedHop, Segment, TraceResult } from '@geotrace/shared';
import { parseTraceroute } from '@geotrace/traceroute-parse';
import Fastify, { type FastifyInstance } from 'fastify';

import { anchorAt, enrich, resolveAnchor, resolveClient } from './enrich.js';
import { cablePath, cableCount } from './cables.js';
import { publicIpFrom } from './data.js';
import { randomBytes } from 'node:crypto';

const MAX_INPUT_BYTES = 64 * 1024;


export async function buildApp(): Promise<FastifyInstance> {
const app = Fastify({ logger: true, bodyLimit: MAX_INPUT_BYTES });

await app.register(cors, { origin: true });

app.get('/api/health', async () => ({
  ok: true,
  service: 'routescope',
  version: '0.1.0',
  cableNodes: cableCount(),
}));

interface InspectBody {
  text?: string;
  mode?: RouteMode;
  /** IP publique du visiteur : sert d'ancre pour les premiers sauts. */
  clientIp?: string;
  /**
   * Ancre en coordonnées, utilisée à la place de l'IP (trace de démonstration) :
   * elle sert à géolocaliser les premiers sauts sans rien exposer du visiteur.
   */
  anchor?: { lat: number; lon: number; city?: string };
}

interface InspectResponse {
  result: TraceResult | null;
  /** Position de d�part du visiteur (IP publique), affich�e comme point #0. */
  client: { ip: string; city: string | null; lat: number; lon: number } | null;
  /** Sauts enrichis, dans l'ordre — sert au panneau (dont le mode geek). */
  hops: Array<ResolvedHop & { color: string; timeout: boolean; polyline?: Array<[number, number]> }>;
  format: string;
  warnings: string[];
  error?: string;
}

function asPathOf(hops: readonly ResolvedHop[]): number[] {
  const path: number[] = [];
  for (const hop of hops) {
    if (hop.asn === null) continue;
    if (path[path.length - 1] !== hop.asn) path.push(hop.asn);
  }
  return path;
}

app.post<{ Body: InspectBody }>('/api/inspect', async (request, reply): Promise<InspectResponse> => {
  const text = request.body?.text ?? '';
  if (text.trim().length === 0) {
    return reply.code(400).send({
      result: null,
      hops: [],
      format: 'unknown',
      warnings: [],
      error: 'Texte vide.',
    });
  }

  const parsed = parseTraceroute(text);
  const body = request.body;
  // L'IP du visiteur est déduite des en-têtes du proxy quand le client ne la
  // fournit pas : sur Vercel, `x-forwarded-for` est toujours présent, alors que
  // l'appel navigateur à 1.1.1.1 est bloqué par certains réseaux ou extensions.
  const requestIp = publicIpFrom(request.headers['x-forwarded-for'], request.ip);
  const clientIp = body?.clientIp ?? requestIp;
  const anchor = clientIp
    ? await resolveAnchor(clientIp)
    : body?.anchor
      ? anchorAt(body.anchor.lat, body.anchor.lon, body.anchor.city ?? null)
      : null;
  const client = clientIp ? await resolveClient(clientIp) : null;
  const hops = await enrich(parsed.hops, anchor ?? undefined);
  const mode: RouteMode = request.body?.mode === 'topo' ? 'topo' : 'line';

  // Étapes entre sauts géolocalisés consécutifs.
  const located = hops.filter((h): h is ResolvedHop & { lat: number; lon: number } => h.lat !== null && h.lon !== null);
  const inputs = located.slice(1).map((hop, i) => {
    const from: LatLon = [located[i]!.lat, located[i]!.lon];
    const to: LatLon = [hop.lat, hop.lon];
    // Mode Topo : on suit les câbles quand ils sont disponibles et que le saut
    // est assez long (le seuil est appliqué par `routeHop`).
    const cablePolyline = mode === 'topo' ? cablePath(from, to) : null;
    return { from, to, cablePolyline };
  });

  // Trajet le long des cables par saut : c'est ce que dessine le globe 3D,
  // qui relie les sauts deux a deux (la carte 2D, elle, relie les villes).
  const polylineByTtl = new Map<number, Array<[number, number]>>();
  inputs.forEach((input, i) => {
    const toHop = located[i + 1];
    if (toHop && input.cablePolyline && input.cablePolyline.length > 1) {
      polylineByTtl.set(toHop.ttl, input.cablePolyline.map(([lat, lon]) => [lat, lon]));
    }
  });


  const { segments, distanceKm } = computeSegments(inputs, mode);
  const rtts = located.map((h) => h.rttMs);
  const segmentsWithRtt = withRttDeltas(segments, rtts);

  const rttFinal = lastRespondingRttMs(hops);
  const speedKmS = rttFinal > 0 ? (distanceKm * 2000) / rttFinal : 0;

  const groups = groupByCity(hops);

  // Mode Topo : chaque ville porte la polyligne de cable qui y mene. C'est ce
  // que dessinent la carte 2D et le globe (un trace le long des cables) ; en
  // mode Ligne, aucun trace n'est renvoye et le client dessine des grands cercles.
  if (mode === 'topo') {
    for (let i = 1; i < groups.length; i++) {
      const previous = groups[i - 1]!;
      const group = groups[i]!;
      const path = cablePath([previous.lat, previous.lon], [group.lat, group.lon]);
      if (path) group.polyline = path.map(([lat, lon]) => [lat, lon]);
    }
  }

  // Confiance globale : moyenne des sauts effectivement localisés, moins une
  // pénalité pour les sauts publics qu'on n'a pas pu placer. On ne compte pas
  // les sauts privés/loopback (qui n'ont pas vocation à être géolocalisés).
  const locatedHops = hops.filter((h) => h.lat !== null);
  const publicHops = hops.filter((h) => !h.private);
  const unlocated = publicHops.filter((h) => h.lat === null).length;
  const meanLocated =
    locatedHops.length === 0
      ? 0
      : locatedHops.reduce((acc, h) => acc + h.confidence, 0) / locatedHops.length;
  // Deux indicateurs distincts, comme le ferait un outil pro :
  //  - confiance : qualit� des positions calcul�es ;
  //  - couverture : part des sauts publics qu'on a pu placer.
  const confidence = Math.max(0, Math.min(0.99, meanLocated));
  const coverage =
    publicHops.length > 0 ? (publicHops.length - unlocated) / publicHops.length : 0;

  const result: TraceResult = {
    target: parsed.target ?? parsed.destIp ?? hops[hops.length - 1]?.host ?? hops[hops.length - 1]?.ip ?? '(cible inconnue)',
    destIp: parsed.destIp ?? hops[hops.length - 1]?.ip ?? null,
    anycast: false,
    asPath: asPathOf(hops),
    distanceKm,
    speedKmS,
    segments: segmentsWithRtt,
    groups,
    confidence,
    coverage,
  };

  // Couleur par saut, comme le site : verte → orange → rouge selon la vitesse du segment.
  const colorByTtl = new Map<number, string>();
  segmentsWithRtt.forEach((seg: Segment, i) => {
    const toHop = located[i + 1];
    if (!toHop) return;
    colorByTtl.set(toHop.ttl, hex(segmentRGB(seg.km, seg.rttDeltaMs)));
  });

  return {
    result,
    client,
    hops: hops.map((h) => ({
      ...h,
      color: colorByTtl.get(h.ttl) ?? '#8b949e',
      timeout: h.rttMs === 0 && !h.private,
      ...(polylineByTtl.has(h.ttl) ? { polyline: polylineByTtl.get(h.ttl) } : {}),
    })),
    format: parsed.format,
    warnings: parsed.warnings,
  };
});

/* ------------------------------------------------------------- partage */

/** Trac�s partag�s : identifiant court -> texte brut. En m�moire. */
const shares = new Map<string, string>();

app.post<{ Body: { text?: string } }>('/api/share', async (request, reply) => {
  const text = request.body?.text ?? '';
  if (text.trim().length === 0) return reply.code(400).send({ ok: false });
  const id = randomBytes(8).toString('hex');
  shares.set(id, text);
  if (shares.size > 500) shares.delete(shares.keys().next().value!);
  return { ok: true, id };
});

app.get<{ Params: { id: string } }>('/api/share/:id', async (request, reply) => {
  const text = shares.get(request.params.id);
  if (!text) return reply.code(404).send({ ok: false });
  return { ok: true, text };
});

/** Lien court : redirige vers l'app qui rechargera le trac�. */
app.get<{ Params: { id: string } }>('/s/:id', async (request, reply) => {
  const id = request.params.id;
  if (!shares.has(id)) return reply.code(404).type('text/html').send('<h1>Trac� introuvable</h1>');
  return reply.type('text/html').send(
    `<!doctype html><meta http-equiv="refresh" content="0;url=/?share=${id}"><title>RouteScope</title>`,
  );
});

/* -------------------------------------------------------------- r�cents */

interface RecentItem {
  target: string;
  at: number;
}

const recents: RecentItem[] = [];

app.post<{ Body: { target?: string } }>('/api/recent', async (request) => {
  const target = request.body?.target?.trim();
  if (target) {
    const existing = recents.findIndex((r) => r.target === target);
    if (existing >= 0) recents.splice(existing, 1);
    recents.unshift({ target, at: Date.now() });
    if (recents.length > 20) recents.length = 20;
    if (!shares.has('recent')) shares.set('recent', '');
  }
  return { ok: true, items: recents };
});

app.get('/api/recent', async () => ({ ok: true, items: recents }));

  return app;
}
