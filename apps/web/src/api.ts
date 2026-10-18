import type { ResolvedHop, TraceResult } from '@geotrace/shared';

/** Un saut enrichi, avec sa couleur de segment et son état de timeout. */
export interface InspectHop extends ResolvedHop {
  color: string;
  timeout: boolean;
  /** Trajet le long des câbles qui arrive à ce saut (mode Topo). */
  polyline?: Array<[number, number]>;
}

export interface ClientPosition {
  ip: string;
  city: string | null;
  lat: number;
  lon: number;
}

export interface InspectResponse {
  result: TraceResult | null;
  client?: ClientPosition | null;
  hops: InspectHop[];
  format: string;
  warnings: string[];
  error?: string;
}

/**
 * Détecte l'IP publique du visiteur, sans saisie ni permission :
 * d'abord Cloudflare (`1.1.1.1/cdn-cgi/trace`), puis ipify en secours.
 *
 * C'est l'ancre du tracé : les premiers sauts (faible latence) sont près de
 * cette IP, ce qui évite de les placer à l'autre bout du pays.
 */
export async function detectClientIp(): Promise<string | null> {
  try {
    const res = await fetch('https://1.1.1.1/cdn-cgi/trace', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const match = (await res.text()).match(/^ip=(.+)$/m);
      if (match?.[1]) return match[1].trim();
    }
  } catch {
    // on tente le secours
  }

  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return ((await res.json()) as { ip?: string }).ip ?? null;
  } catch {
    // pas d'IP publique : le serveur fera sans ancre
  }

  return null;
}

/** Envoie un traceroute collé au serveur et récupère le résultat prêt à afficher. */
export async function inspect(
  text: string,
  mode: 'line' | 'topo' = 'line',
  clientIp?: string,
  anchor?: { lat: number; lon: number; city?: string },
): Promise<InspectResponse> {
  const res = await fetch('/api/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, mode, clientIp, anchor }),
  });
  if (!res.ok && res.status !== 400) {
    throw new Error(`Le serveur a répondu ${res.status}`);
  }
  return (await res.json()) as InspectResponse;
}
