/**
 * Enrichissement des sauts : rDNS (PTR), ASN et géolocalisation.
 *
 * Fournisseurs utilisés :
 *  - **rDNS** : DNS-over-HTTPS (Cloudflare) — gratuit, sans clé.
 *  - **ASN + ville + pays** : `ip-api.com` (endpoint `batch`, gratuit) —
 *    **fournisseur temporaire**, à remplacer par les bases locales
 *    MaxMind GeoLite2 / IP2Location (voir `README.md`) pour être conforme au plan.
 *
 * Tout est mis en cache : une même IP n'est jamais interrogée deux fois.
 */

import { ANCHOR_OVERRIDES, haversine, inferPath, type GeoHint } from '@geotrace/geo';
import { open, type CityResponse, type Reader } from 'maxmind';
import type { Hop, ResolvedHop } from '@geotrace/shared';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOH = 'https://cloudflare-dns.com/dns-query';

interface CacheEntry<T> {
  value: T;
  expires: number;
}

class TtlCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();
  constructor(private readonly ttlMs: number, private readonly max = 5000) {}

  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

const ptrCache = new TtlCache<string | null>(6 * 60 * 60 * 1000);
const geoCache = new TtlCache<GeoInfo | null>(6 * 60 * 60 * 1000);
const asnCache = new TtlCache<AsnLookup | null>(6 * 60 * 60 * 1000);

export interface GeoInfo {
  asn: number | null;
  asName: string | null;
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
}

const EMPTY_GEO: GeoInfo = { asn: null, asName: null, country: null, city: null, lat: null, lon: null };

/** Nom DNS inversé (`1.2.3.4` → `4.3.2.1.in-addr.arpa`). */
function reverseName(ip: string): string | null {
  if (ip.includes(':')) {
    // IPv6 : nième nibble inversé.
    const full = ip.split('::');
    const head = full[0] ? full[0]!.split(':') : [];
    const tail = full[1] ? full[1]!.split(':') : [];
    const pad = new Array(8 - head.length - tail.length).fill('0');
    const groups = [...head, ...pad, ...tail].map((g) => g.padStart(4, '0'));
    if (groups.length !== 8) return null;
    return `${groups.join('').split('').reverse().join('.')}.ip6.arpa`;
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return `${parts.reverse().join('.')}.in-addr.arpa`;
}

/** PTR via DNS-over-HTTPS. Renvoie `null` si aucune réponse. */
export async function lookupPtr(ip: string): Promise<string | null> {
  const cached = ptrCache.get(ip);
  if (cached !== undefined) return cached;

  const name = reverseName(ip);
  if (!name) {
    ptrCache.set(ip, null);
    return null;
  }

  try {
    const res = await fetch(`${DOH}?name=${name}&type=PTR`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      ptrCache.set(ip, null);
      return null;
    }
    const json = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    const answer = json.Answer?.find((a) => a.type === 12);
    const value = answer ? answer.data.replace(/\.$/, '') : null;
    ptrCache.set(ip, value);
    return value;
  } catch {
    ptrCache.set(ip, null);
    return null;
  }
}

/* --------------------------------------------------- base locale (DB-IP Lite) */

/**
 * Base ville locale (MMDB, DB-IP Lite, CC BY 4.0) � bien meilleure que l'API
 * gratuite sur les plages backbone. Charg�e une fois, en m�moire.
 */
interface LocalGeo {
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
}

let localReader: Promise<Reader<CityResponse> | null> | null = null;

function getLocalReader(): Promise<Reader<CityResponse> | null> {
  localReader ??= (async () => {
    const candidates = [
      new URL('../../../packages/geo-data/geoip/dbip-city-lite.mmdb', import.meta.url),
      new URL('../../../../packages/geo-data/geoip/dbip-city-lite.mmdb', import.meta.url),
    ];
    for (const url of candidates) {
      try {
        return await open<CityResponse>(fileURLToPath(url));
      } catch {
        // fichier absent ou illisible : on essaie le chemin suivant
      }
    }
    return null;
  })();
  return localReader;
}

/** Ville/pays/coordonn�es depuis la base locale, ou `null`. */
export function lookupLocal(ip: string, reader: Reader<CityResponse> | null): LocalGeo | null {
  if (!reader) return null;
  try {
    const rec = reader.get(ip);
    if (!rec) return null;
    const city = rec.city?.names?.fr ?? rec.city?.names?.en ?? null;
    const country = rec.country?.iso_code ?? null;
    const lat = rec.location?.latitude ?? null;
    const lon = rec.location?.longitude ?? null;
    if (lat === null || lon === null) return null;
    return { city, country, lat, lon };
  } catch {
    return null;
  }
}

interface IpApiBatchEntry {
  query?: string;
  status?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  lat?: number;
  lon?: number;
  as?: string;
}

function parseAsField(as: string | undefined): { asn: number | null; asName: string | null } {
  if (!as) return { asn: null, asName: null };
  const m = /^AS(\d+)\s*(.*)$/.exec(as);
  if (!m) return { asn: null, asName: as };
  return { asn: Number.parseInt(m[1]!, 10), asName: m[2]!.trim() || null };
}

/** ASN + ville + pays pour plusieurs IP en un appel (`ip-api` batch). */
export async function lookupGeoBatch(ips: readonly string[]): Promise<Map<string, GeoInfo>> {
  const result = new Map<string, GeoInfo>();
  const missing: string[] = [];

  for (const ip of ips) {
    const cached = geoCache.get(ip);
    if (cached !== undefined) result.set(ip, cached ?? EMPTY_GEO);
    else missing.push(ip);
  }

  if (missing.length === 0) return result;

  try {
    const res = await fetch('http://ip-api.com/batch?fields=status,country,countryCode,city,lat,lon,as,query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(missing),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const rows = (await res.json()) as IpApiBatchEntry[];
      for (const row of rows) {
        const ip = row.query;
        if (!ip) continue;
        const info: GeoInfo =
          row.status === 'success'
            ? {
                ...parseAsField(row.as),
                country: row.countryCode ?? row.country ?? null,
                city: row.city ?? null,
                lat: typeof row.lat === 'number' ? row.lat : null,
                lon: typeof row.lon === 'number' ? row.lon : null,
              }
            : EMPTY_GEO;
        geoCache.set(ip, info);
        result.set(ip, info);
      }
    }
  } catch {
    // Réseau indisponible : on continue sans géolocalisation plutôt que d'échouer.
  }

  for (const ip of missing) if (!result.has(ip)) result.set(ip, EMPTY_GEO);
  return result;
}

/** Enrichit et géolocalise les sauts : PTR + GeoIP, puis inférence (rDNS prioritaire + latence). */
export async function enrich(hops: readonly Hop[], anchor?: { lat: number; lon: number; city?: string }): Promise<ResolvedHop[]> {
  const ips = [...new Set(hops.filter((h) => h.ip !== null && !h.private).map((h) => h.ip!))];

  const ptr = new Map<string, string | null>();
  await runLimited(ips, 8, async (ip) => {
    ptr.set(ip, await lookupPtr(ip));
  });

  // Ville + coordonnées (ip-api) et ASN + nom d'AS (RIPEstat) en parallèle.
  const [geo, asns] = await Promise.all([lookupGeoBatch(ips), lookupAsnBatch(ips)]);

  const reader = await getLocalReader();
  const merged = new Map<string, GeoHint>();
  for (const ip of ips) {
    const api = geo.get(ip) ?? null;
    const local = lookupLocal(ip, reader);
    const a = asns.get(ip) ?? null;

    let city: string | null = api?.city ?? null;
    let country: string | null = api?.country ?? null;
    let lat: number | null = api?.lat ?? null;
    let lon: number | null = api?.lon ?? null;
    let geoConfidence = 0.72;

    if (local && local.lat !== null && local.lon !== null) {
      const sameCity =
        !!local.city && !!api?.city && local.city.toLowerCase() === api.city.toLowerCase();
      const sameCountry = !!local.country && local.country === api?.country;

      city = local.city ?? city;
      country = local.country ?? country;
      lat = local.lat;
      lon = local.lon;

      // Deux bases ind�pendantes qui concordent = preuve forte ;
      // un d�saccord reste une information exploitable, mais plus faible.
      // Toujours sous le code IATA exact du PTR (0,90) : sur un routeur de
      // backbone, le nom DNS reste le signal le plus fiable.
      geoConfidence = sameCity ? 0.88 : sameCountry ? 0.82 : 0.78;
    }

    merged.set(ip, {
      asn: a?.asn ?? api?.asn ?? null,
      asName: a?.holder ?? api?.asName ?? null,
      country,
      city,
      lat,
      lon,
      confidence: geoConfidence,
    });
  }

  return inferPath({ hops, ptr, geo: merged, anchor });
}

/** ASN d'une IP via **RIPEstat** (couvre tous les registres, renvoie aussi le nom). */
export interface AsnLookup {
  asn: number;
  holder: string | null;
}

export async function lookupAsn(ip: string): Promise<AsnLookup | null> {
  const cached = asnCache.get(ip);
  if (cached !== undefined) return cached;

  let result: AsnLookup | null = null;
  try {
    const res = await fetch(
      `https://stat.ripe.net/data/prefix-overview/data.json?resource=${encodeURIComponent(ip)}`,
      { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { asns?: Array<{ asn?: number; holder?: string }> };
      };
      const first = json.data?.asns?.[0];
      if (first && typeof first.asn === 'number') {
        result = { asn: first.asn, holder: first.holder ?? null };
      }
    }
  } catch {
    // Réseau indisponible : on continue sans ASN.
  }

  asnCache.set(ip, result);
  return result;
}

/** ASN de plusieurs IP (limité en parallèle). */
export async function lookupAsnBatch(ips: readonly string[]): Promise<Map<string, AsnLookup | null>> {
  const out = new Map<string, AsnLookup | null>();
  await runLimited(ips, 6, async (ip) => {
    out.set(ip, await lookupAsn(ip));
  });
  return out;
}

/** Une IP privée ou de loopback ne peut pas servir d'ancre. */
function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80');
  const p = ip.split('.').map((x) => Number.parseInt(x, 10));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  return a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/**
 * Résout l'ancre : position de l'IP publique du visiteur.
 * Base locale d'abord (plus précise), puis ip-api.
 */
let namedCities: Array<[string, number, number, number]> | null = null;

/** Villes nommées (Natural Earth) pour recaler l'ancre sur une vraie ville. */
function getNamedCities(): Array<[string, number, number, number]> {
  if (namedCities) return namedCities;
  const rows: Array<[string, number, number, number]> = [];
  for (const rel of [
    '../../../apps/web/public/world/cities-named.json',
    '../../../data/geo/cities-fr.json',
  ]) {
    try {
      const url = new URL(rel, import.meta.url);
      rows.push(...(JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as Array<[string, number, number, number]>));
    } catch {
      // fichier absent : on continue
    }
  }
  namedCities = rows;
  return rows;
}

/**
 * Une IP d'accès est souvent enregistrée sur un village voisin (ex. Le Rouret
 * pour un abonné de Cannes). On recale l'ancre sur la ville de plus de
 * 50 000 habitants la plus proche, dans un rayon de 40 km.
 */
function snapAnchor(lat: number, lon: number, city: string | null): { lat: number; lon: number; city?: string } {
  let best: [string, number, number, number] | null = null;
  let bestKm = 40;

  for (const row of getNamedCities()) {
    if (row[3] < 50000) continue;
    const km = haversine([lat, lon], [row[1], row[2]]);
    if (km < bestKm) {
      bestKm = km;
      best = row;
    }
  }

  if (best) return { lat: best[1], lon: best[2], city: best[0] };
  return { lat, lon, ...(city ? { city } : {}) };
}

/** Applique une surcharge de commune d'enregistrement -> ville de POP. */
function anchorOverride(city: string | null | undefined): { lat: number; lon: number; city?: string } | undefined {
  const key = city?.trim().toLowerCase();
  if (!key) return undefined;
  const hit = Object.entries(ANCHOR_OVERRIDES).find(([k]) => k.toLowerCase() === key);
  return hit ? { lat: hit[1].lat, lon: hit[1].lon, city: hit[1].city } : undefined;
}

export async function resolveClient(ip: string): Promise<{ ip: string; city: string | null; lat: number; lon: number } | null> {
  if (!ip || isPrivateIp(ip)) return null;

  const reader = await getLocalReader();
  const local = lookupLocal(ip, reader);
  if (local && local.lat !== null && local.lon !== null) {
    return { ip, city: local.city, lat: local.lat, lon: local.lon };
  }

  const api = await lookupGeoBatch([ip]);
  const g = api.get(ip);
  if (g && g.lat !== null && g.lon !== null) {
    return { ip, city: g.city, lat: g.lat, lon: g.lon };
  }

  return null;
}


/**
 * Ancre explicite, donnée en coordonnées : sert au trace de démonstration, où
 * l'on ne veut ni IP de visiteur ni dépendance à sa position réelle.
 */
export function anchorAt(
  lat: number,
  lon: number,
  city: string | null = null,
): { lat: number; lon: number; city?: string } {
  return snapAnchor(lat, lon, city);
}

export async function resolveAnchor(ip: string): Promise<{ lat: number; lon: number; city?: string } | null> {
  if (!ip || isPrivateIp(ip)) return null;

  const reader = await getLocalReader();
  const local = lookupLocal(ip, reader);
  if (local && local.lat !== null && local.lon !== null) {
    const ovLocal = anchorOverride(local.city);
    if (ovLocal) return { lat: ovLocal.lat, lon: ovLocal.lon, city: ovLocal.city };
    return snapAnchor(local.lat, local.lon, local.city);
  }

  const api = await lookupGeoBatch([ip]);
  const g = api.get(ip);
  if (g && g.lat !== null && g.lon !== null) {
    const ovApi = anchorOverride(g.city);
    if (ovApi) return { lat: ovApi.lat, lon: ovApi.lon, city: ovApi.city };
    return snapAnchor(g.lat, g.lon, g.city);
  }

  return null;
}

/** Exécute des tâches asynchrones avec une limite de parallélisme. */
export async function runLimited<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++]!;
      await worker(current);
    }
  });
  await Promise.all(runners);
}
