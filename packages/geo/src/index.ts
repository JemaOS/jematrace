/**
 * Géométrie et métriques du chemin — les formules vérifiées sur le site de
 * référence. Ce paquet ne dépend que des types partagés.
 */

import type { CityGroup, Hop, ResolvedHop, Segment } from '@geotrace/shared';

import { cityByCode, cityByName, FACILITY_OVERRIDES, HOSTNAME_STOPWORDS, POP_OVERRIDES } from './airports.js';

export { AIRPORTS, AIRPORT_COUNT, ANCHOR_OVERRIDES, cityByCode, cityByName, FACILITY_OVERRIDES, HOSTNAME_STOPWORDS, POP_OVERRIDES } from './airports.js';
export type { CityRef } from './airports.js';

/** Point géographique : `[latitude, longitude]`, comme les données de câbles. */
export type LatLon = readonly [number, number];

/** Mode de dessin : le long des câbles (`topo`) ou grands cercles (`line`). */
export type RouteMode = 'topo' | 'line';

/** Rayon terrestre utilisé par le site de référence. */
export const EARTH_RADIUS_KM = 6371;

const DEG = Math.PI / 180;

/** Distance orthodromique (grand cercle) en km. */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = (b[0] - a[0]) * DEG;
  const dLon = (b[1] - a[1]) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * DEG) * Math.cos(b[0] * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

/** Longueur cumulée d'une polyligne. */
export function polylineLength(points: readonly LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1]!, points[i]!);
  return total;
}

/** Une étape entre deux sauts, avec son éventuel tracé câble. */
export interface SegmentInput {
  from: LatLon;
  to: LatLon;
  /** Polyligne du câble pour cette étape (`topo` uniquement), ou `null`. */
  cablePolyline?: readonly LatLon[] | null;
}

/**
 * Longueur de chaque étape et distance totale.
 *
 * En mode `topo`, une étape dispose de sa polyligne de câble → on mesure le long
 * de la polyligne ; sinon, grand cercle. En mode `line`, toujours le grand cercle.
 * C'est ce qui explique l'écart mesuré : 13 758 km (Topo) contre 9 645 km (Ligne)
 * pour la même route.
 */
export function computeSegments(
  inputs: readonly SegmentInput[],
  mode: RouteMode,
): { segments: Segment[]; distanceKm: number } {
  const segments: Segment[] = [];
  let distanceKm = 0;

  inputs.forEach((input, i) => {
    const useCable = mode === 'topo' && input.cablePolyline && input.cablePolyline.length > 1;
    const km = useCable ? polylineLength(input.cablePolyline!) : haversine(input.from, input.to);
    distanceKm += km;
    segments.push({ fromIndex: i, toIndex: i + 1, km, rttDeltaMs: 0 });
  });

  return { segments, distanceKm };
}

/** Renseigne `rttDeltaMs` à partir des RTT par saut (le RTT retenu est le minimum). */
export function withRttDeltas(segments: readonly Segment[], rttPerIndex: readonly number[]): Segment[] {
  return segments.map((s) => ({
    ...s,
    rttDeltaMs: (rttPerIndex[s.toIndex] ?? 0) - (rttPerIndex[s.fromIndex] ?? 0),
  }));
}

/**
 * Fusionne les sauts consécutifs situés dans la même ville.
 *
 * La latence affichée d'un groupe est le **minimum** de ses sauts (constaté :
 * `228 ms` pour un groupe dont les sauts vont de 228 à 243 ms).
 * `kmFromPrev` est la distance depuis la ville du groupe précédent (mode geek).
 */
export function groupByCity(hops: readonly ResolvedHop[]): CityGroup[] {
  const groups: CityGroup[] = [];

  for (const hop of hops) {
    if (hop.lat === null || hop.lon === null || hop.city === null) continue;
    const last = groups[groups.length - 1];
    const sameCity =
      last !== undefined &&
      last.city === hop.city &&
      (last.country ?? '') === (hop.country ?? '');

    if (sameCity && last) {
      last.hops.push(hop);
      last.rttMs = Math.min(last.rttMs, hop.rttMs);
      continue;
    }

    const point: LatLon = [hop.lat, hop.lon];
    const kmFromPrev = last ? haversine([last.lat, last.lon], point) : 0;
    groups.push({
      i: groups.length + 1,
      country: hop.country,
      continent: hop.continent,
      city: hop.city,
      lat: hop.lat,
      lon: hop.lon,
      rttMs: hop.rttMs,
      kmFromPrev: Math.round(kmFromPrev),
      hops: [hop],
    });
  }

  return groups;
}

/** Somme des `kmFromPrev` des groupes (contrôle de cohérence avec la distance). */
export function groupPathDistanceKm(groups: readonly CityGroup[]): number {
  return groups.reduce((acc, g) => acc + g.kmFromPrev, 0);
}

/** RTT du dernier saut qui a répondu — sert au calcul de la vitesse du chemin. */
export function lastRespondingRttMs(hops: readonly ResolvedHop[]): number {
  for (let i = hops.length - 1; i >= 0; i--) {
    const rtt = hops[i]!.rttMs;
    if (Number.isFinite(rtt) && rtt > 0) return rtt;
  }
  return 0;
}

/* ------------------------------------------------------------------ inférence */

/** Informations fournies par la base GeoIP pour une IP. */
export interface GeoHint {
  asn: number | null;
  asName: string | null;
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  /** Fiabilit� de la source GeoIP (0..1), renseign�e par l'appelant. */
  confidence?: number;
}

const EMPTY_HINT: GeoHint = {
  asn: null,
  asName: null,
  country: null,
  city: null,
  lat: null,
  lon: null,
};

/** Candidat de localisation pour un saut. */
export interface CityCandidate {
  city: string;
  country: string | null;
  lat: number;
  lon: number;
  /** 0..1 — priorité entre candidats. */
  confidence: number;
  source: 'rdns' | 'geo' | 'anchor';
}

/** Kilomètres parcourables par milliseconde de RTT aller-retour en fibre (≈ 2/3 c). */
export const KM_PER_RTT_MS = 80;

/** Marge au-dessus de la borne de latence (imprécision des centroïdes de ville). */
export const LATENCY_MARGIN_KM = 150;

/**
 * Candidats déduits du nom DNS inversé.
 *
 * `be3184.ccr42.par01.atlas.cogentco.com` → `par01` → **Paris** (code exact, 0.9).
 * `nimar202.rbci.orange.net` → `nimar202` → préfixe `nim` → **Nîmes** (0.6).
 * Les mots d'équipement (`atlas`, `cogent`…) sont ignorés pour éviter les faux positifs.
 */
export function rdnsCandidates(host: string | null): CityCandidate[] {
  if (!host) return [];
  const out: CityCandidate[] = [];
  const seen = new Set<string>();

  for (const raw of host.toLowerCase().split(/[.\-_]/)) {
    const token = raw.replace(/\d+/g, '');
    if (!token || HOSTNAME_STOPWORDS.has(token)) continue;

    // Surcharge de POP op�rateur, prioritaire sur la lecture IATA.
    const override = POP_OVERRIDES[token];
    if (override && !seen.has(override.city)) {
      seen.add(override.city);
      out.push({ city: override.city, country: override.country, lat: override.lat, lon: override.lon, confidence: 0.92, source: 'rdns' });
      continue;
    }

    if (token.length === 3) {
      const ref = cityByCode(token);
      if (ref && !seen.has(ref.city)) {
        seen.add(ref.city);
        out.push({ city: ref.city, country: ref.country, lat: ref.lat, lon: ref.lon, confidence: 0.9, source: 'rdns' });
      }
      continue;
    }

    if (token.length > 3) {
      const byName = cityByName(token);
      if (byName && !seen.has(byName.city)) {
        seen.add(byName.city);
        out.push({ city: byName.city, country: byName.country, lat: byName.lat, lon: byName.lon, confidence: 0.8, source: 'rdns' });
        continue;
      }
      const ref = cityByCode(token.slice(0, 3));
      if (ref && !seen.has(ref.city)) {
        seen.add(ref.city);
        out.push({ city: ref.city, country: ref.country, lat: ref.lat, lon: ref.lon, confidence: 0.75, source: 'rdns' });
      }
    }
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Point de d�part connu (ville de l'utilisateur), utilis� pour ancrer les premiers sauts. */
export interface Anchor {
  lat: number;
  lon: number;
  city?: string;
}

export interface InferInput {
  hops: readonly Hop[];
  /** Ville de d�part : les sauts � faible latence sont ramen�s pr�s d'elle. */
  anchor?: Anchor;
  /** PTR par IP (peut être absent). */
  ptr?: ReadonlyMap<string, string | null>;
  /** GeoIP + ASN par IP. */
  geo?: ReadonlyMap<string, GeoHint>;
}

/**
 * Attribue une position à chaque saut.
 *
 * Règles, dans l'ordre :
 *  1. les candidats viennent du **PTR** (le plus fiable pour un routeur de backbone)
 *     puis de la **base GeoIP** ;
 *  2. le premier saut public géolocalisé devient l'**origine** ;
 *  3. tout candidat dont la distance à l'origine dépasse `100 km × RTT + marge`
 *     est **rejeté** — c'est le garde-fou de latence, qui écarte les villes
 *     physiquement impossibles (c'est ce qui corrige les sauts aberrantes) ;
 *  4. un saut sans candidat plausible garde le nom de ville mais **sans
 *     coordonnées**, et `estimated = true` (il ne compte pas dans la distance).
 */
export function inferPath({ hops, ptr, geo, anchor }: InferInput): ResolvedHop[] {
  const out: ResolvedHop[] = [];
  let origin: LatLon | null = anchor ? [anchor.lat, anchor.lon] : null;
  let previous: LatLon | null = anchor ? [anchor.lat, anchor.lon] : null;

  for (const hop of hops) {
    const rttMs = hop.rttMs.length ? Math.min(...hop.rttMs) : 0;
    const hint = (hop.ip && geo?.get(hop.ip)) || EMPTY_HINT;
    const host = hop.host ?? (hop.ip ? (ptr?.get(hop.ip) ?? null) : null);

    const base = {
      ttl: hop.ttl,
      ip: hop.ip ?? '',
      host,
      rttMs,
      asn: hint.asn,
      asName: hint.asName,
      continent: null,
      private: hop.private,
    };

    if (hop.ip === null || hop.private) {
      out.push({
        ...base,
        country: null,
        city: hop.private ? 'réseau local' : null,
        lat: null,
        lon: null,
        confidence: hop.private ? 1 : 0,
        estimated: false,
      });
      continue;
    }

    const candidates: CityCandidate[] = [...rdnsCandidates(host)];
    if (hint.lat !== null && hint.lon !== null && hint.city) {
      candidates.push({
        city: hint.city,
        country: hint.country,
        lat: hint.lat,
        lon: hint.lon,
        confidence: hint.confidence ?? 0.7,
        source: 'geo',
      });
    }
    candidates.sort((a, b) => b.confidence - a.confidence);

    let chosen: CityCandidate | null = null;

    // Ancrage : un saut a tres faible latence est forcement pres du point de
    // depart. On l'applique AVANT la borne de latence, sinon celle-ci rejette
    // aussi l'ancre quand elle est plus proche que le meilleur candidat.
    if (anchor && rttMs > 0 && rttMs <= 6) {
      const best = candidates[0] ?? null;
      const dAnchor = best
        ? haversine([anchor.lat, anchor.lon], [best.lat, best.lon])
        : Number.POSITIVE_INFINITY;
      if (!best || dAnchor > 300) {
        chosen = {
          city: anchor.city ?? best?.city ?? 'inconnu',
          country: best?.country ?? null,
          lat: anchor.lat,
          lon: anchor.lon,
          confidence: 0.92,
          source: 'anchor',
        };
      }
    }

    if (!chosen) {
      if (origin === null) {
        chosen = candidates[0] ?? null;
      } else {
        // La borne de latence n'a de sens que si l'on connaît le RTT. Sans
        // mesure (sortie collée sans latences), `allowed` tomberait à 150 km et
        // rejetterait tous les candidats : les sauts resteraient sans
        // coordonnées, donc invisibles sur la carte.
        const allowed = rttMs > 0 ? KM_PER_RTT_MS * rttMs + LATENCY_MARGIN_KM : Number.POSITIVE_INFINITY;
        chosen = candidates.find((c) => haversine(origin!, [c.lat, c.lon]) <= allowed) ?? null;
      }
    }

    if (chosen) {
      if (origin === null) origin = [chosen.lat, chosen.lon];

      // Site technique de l'ASN : on descend de la ville GeoIP a la commune
      // ou se trouve reellement l'equipement (Chatillon, Leesburg...).
      // On matche par ASN, ou par ville seule quand l'ASN est inconnu ET que le
      // routeur n'a pas de PTR (sinon on ecraserait un routeur identifie).
      const facility = FACILITY_OVERRIDES.find(
        (f) =>
          f.city.toLowerCase() === (chosen!.city ?? '').toLowerCase() &&
          (f.asn === hint.asn || (hint.asn === null && !host)),
      );
      if (facility) {
        chosen = {
          ...chosen,
          city: facility.to,
          lat: facility.lat,
          lon: facility.lon,
          confidence: Math.max(chosen.confidence, 0.9),
        };
      }
      // Le pays de la base peut contredire la ville (ville homonyme) : la table
      // des villes connues tranche.
      const ref = cityByName(chosen.city);

      /* ---- score de confiance : on additionne les preuves qui concordent ---- */
      const rdnsCand = candidates.find((c) => c.source === 'rdns');
      const geoCand = candidates.find((c) => c.source === 'geo');
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

      let confidence = chosen.confidence;
      let agreement = false;

      if (rdnsCand && geoCand) {
        const sameCity = normalize(rdnsCand.city) === normalize(geoCand.city);
        const sameCountry =
          !!rdnsCand.country && !!geoCand.country && rdnsCand.country === geoCand.country;
        if (sameCity) {
          agreement = true;
          confidence = Math.min(0.99, Math.max(rdnsCand.confidence, geoCand.confidence) + 0.09);
        } else if (sameCountry) {
          confidence = Math.max(confidence, 0.84);
        } else {
          // Désaccord franc : on garde le candidat le plus fiable mais on baisse.
          confidence = Math.min(confidence, 0.78);
        }
      }

      // Le pays de la ville connue doit concorder avec le pays annoncé.
      if (ref && hint.country && ref.country === hint.country) {
        confidence = Math.min(0.99, confidence + 0.02);
      }

      // Marge de latence : loin de la borne = position très plausible ;
      // collé à la borne = suspect.
      const allowed = KM_PER_RTT_MS * rttMs + LATENCY_MARGIN_KM;
      const fromOrigin = haversine(origin, [chosen.lat, chosen.lon]);
      if (allowed > 0) {
        if (fromOrigin < 0.6 * allowed) confidence = Math.min(0.99, confidence + 0.03);
        else if (fromOrigin > 0.95 * allowed) confidence = Math.max(0.35, confidence - 0.12);
      }

      // Continuité : un routeur proche du précédent est cohérent.
      if (previous && haversine(previous, [chosen.lat, chosen.lon]) < 1500) {
        confidence = Math.min(0.99, confidence + 0.02);
      }

      const point: LatLon = [chosen.lat, chosen.lon];
      previous = point;

      out.push({
        ...base,
        country: ref?.country ?? chosen.country ?? hint.country,
        city: chosen.city,
        lat: chosen.lat,
        lon: chosen.lon,
        confidence,
        // Une position issue de la base seule reste une estimation, sauf si le
        // DNS inverse confirme la même ville.
        estimated: chosen.source === 'geo' && !agreement,
      });
    } else {
      const fallback = candidates[0] ?? null;
      const ref = fallback ? cityByName(fallback.city) : undefined;
      out.push({
        ...base,
        country: ref?.country ?? fallback?.country ?? hint.country,
        city: fallback?.city ?? null,
        lat: null,
        lon: null,
        confidence: 0,
        estimated: true,
      });
    }
  }

  return out;
}
