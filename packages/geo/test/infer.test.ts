import { describe, expect, it } from 'vitest';

import type { Hop } from '@geotrace/shared';

import { computeSegments, inferPath, rdnsCandidates, type GeoHint } from '../src/index';

function hop(ttl: number, ip: string | null, host: string | null, rtt: number | null): Hop {
  return {
    ttl,
    ip,
    host,
    rttMs: rtt === null ? [] : [rtt],
    timeout: rtt === null,
    private: ip === '192.168.1.1',
  };
}

/** GeoIP volontairement bruité, comme le fournisseur réel : plusieurs villes sont fausses. */
const GEO = new Map<string, GeoHint>([
  ['80.15.224.25', { asn: 3215, asName: 'Orange', country: 'FR', city: 'Paris', lat: 48.8566, lon: 2.3522 }],
  ['92.184.150.30', { asn: 3215, asName: 'Orange', country: 'FR', city: 'Paris', lat: 48.8566, lon: 2.3522 }],
  ['193.252.103.241', { asn: 3215, asName: 'Orange', country: 'FR', city: 'Rennes', lat: 48.1173, lon: -1.6778 }],
  ['193.252.137.54', { asn: 3215, asName: 'Orange', country: 'FR', city: 'Paris', lat: 48.8566, lon: 2.3522 }],
  ['154.54.38.157', { asn: 174, asName: 'Cogent', country: 'FR', city: 'Paris', lat: 48.8566, lon: 2.3522 }],
  ['154.54.82.2', { asn: 174, asName: 'Cogent', country: 'US', city: 'Washington', lat: 38.9072, lon: -77.0369 }],
  // Erreur volontaire : l'IP est à Atlanta (PTR `atl01`), la base dit Toronto.
  ['154.54.172.170', { asn: 174, asName: 'Cogent', country: 'CA', city: 'Toronto', lat: 43.6532, lon: -79.3832 }],
  // Erreur volontaire : PTR `jan02` = Jackson, la base dit Los Angeles.
  ['154.54.40.110', { asn: 174, asName: 'Cogent', country: 'US', city: 'Los Angeles', lat: 34.0522, lon: -118.2437 }],
  ['154.54.41.53', { asn: 174, asName: 'Cogent', country: 'US', city: 'Dallas', lat: 32.7767, lon: -96.797 }],
  ['154.54.165.30', { asn: 174, asName: 'Cogent', country: 'US', city: 'El Paso', lat: 31.7619, lon: -106.485 }],
  ['154.54.166.70', { asn: 174, asName: 'Cogent', country: 'US', city: 'Phoenix', lat: 33.4484, lon: -112.074 }],
  ['154.54.86.61', { asn: 174, asName: 'Cogent', country: 'US', city: 'San Diego', lat: 32.7157, lon: -117.1611 }],
  // Erreur volontaire la plus grave : la base situe ce routeur en Australie.
  ['154.24.25.146', { asn: 174, asName: 'Cogent', country: 'AU', city: 'Beaumaris', lat: -37.9833, lon: 145.0333 }],
  ['38.140.111.58', { asn: 174, asName: 'Cogent', country: 'US', city: 'San Diego', lat: 32.7157, lon: -117.1611 }],
  ['103.224.213.218', { asn: 133618, asName: 'Trellian', country: 'US', city: 'San Diego', lat: 32.7157, lon: -117.1611 }],
  ['103.224.182.245', { asn: 133618, asName: 'Trellian', country: 'US', city: 'San Diego', lat: 32.7157, lon: -117.1611 }],
]);

/** Sauts réels (le PTR est fourni directement, comme le ferait la résolution inverse). */
const HOPS: Hop[] = [
  hop(1, '192.168.1.1', null, 3),
  hop(2, '80.15.224.25', null, 4),
  hop(3, '92.184.150.30', null, 7),
  hop(4, '193.252.103.241', 'ae43-0.nimar202.rbci.orange.net', 7),
  hop(5, '193.252.137.54', null, 17),
  hop(6, null, null, null),
  hop(7, '154.54.38.157', 'be3184.ccr42.par01.atlas.cogentco.com', 19),
  hop(8, '154.54.82.2', 'port-channel2813.ccr92.dca04.atlas.cogentco.com', 94),
  hop(9, '154.54.172.170', 'be3483.ccr42.atl01.atlas.cogentco.com', 111),
  hop(10, '154.54.40.110', 'port-channel3704.ccr92.jan02.atlas.cogentco.com', 130),
  hop(11, '154.54.41.53', 'be8122.ccr32.dfw01.atlas.cogentco.com', 130),
  hop(12, '154.54.165.30', 'be3846.ccr22.elp02.atlas.cogentco.com', 155),
  hop(13, '154.54.166.70', 'be5473.ccr32.phx01.atlas.cogentco.com', 156),
  hop(14, '154.54.86.61', 'be4725.rcr62.san01.atlas.cogentco.com', 155),
  hop(15, '154.24.25.146', 'be8977.nr61.b022887-0.san01.atlas.cogentco.com', 156),
  hop(16, '38.140.111.58', null, 202),
  hop(17, '103.224.213.218', 'sw02-te2-san.trellian.com', 160),
  hop(18, '103.224.182.245', 'lb-182-245.above.com', 155),
];

describe('rdnsCandidates', () => {
  it('lit le code IATA exact et ignore les mots d’équipement', () => {
    const c = rdnsCandidates('be3184.ccr42.par01.atlas.cogentco.com');
    expect(c[0]!.city).toBe('Paris');
    // « atlas » ne doit jamais être lu comme Atlanta (ATL).
    expect(c.some((x) => x.city === 'Atlanta')).toBe(false);
  });

  it('reconnaît un code collé à des chiffres (san01)', () => {
    expect(rdnsCandidates('sw02-te2-san.trellian.com')[0]!.city).toBe('San Diego');
  });

  it('lit un prefixe de code avec une confiance plus basse (nimar202 -> Nimes)', () => {
    const c = rdnsCandidates('ae43-0.nimar202.rbci.orange.net');
    expect(c[0]!.city).toBe('Antibes');
    expect(c[0]!.confidence).toBeGreaterThanOrEqual(0.9);
    // « orange » (opérateur) ne doit pas produire de candidat.
    expect(c.some((x) => x.city.toLowerCase() === 'orange')).toBe(false);
  });

  it('renvoie une liste vide sans PTR', () => {
    expect(rdnsCandidates(null)).toEqual([]);
  });
});

describe('inferPath', () => {
  const resolved = inferPath({ hops: HOPS, geo: GEO });
  const byTtl = new Map(resolved.map((h) => [h.ttl, h]));

  it('garde un saut par saut d’entrée', () => {
    expect(resolved).toHaveLength(HOPS.length);
  });

  it('étiquette le premier saut privé sans coordonnées', () => {
    const h1 = byTtl.get(1)!;
    expect(h1.private).toBe(true);
    expect(h1.city).toBe('réseau local');
    expect(h1.lat).toBeNull();
  });

  it('préfère le PTR à la base GeoIP quand elles se contredisent', () => {
    expect(byTtl.get(9)!.city).toBe('Atlanta'); // la base disait Toronto
    expect(byTtl.get(10)!.city).toBe('Jackson'); // la base disait Los Angeles
  });

  it('écarte les villes physiquement impossibles (garde-fou de latence)', () => {
    // La base plaçait ce saut en Australie : impossible depuis Paris en 156 ms.
    const h15 = byTtl.get(15)!;
    expect(h15.city).toBe('San Diego');
    expect(h15.country).toBe('US');
  });

  it('situe le chemin de façon plausible', () => {
    const located = resolved.filter((h) => h.lat !== null && h.lon !== null);
    const inputs = located.slice(1).map((h, i) => ({
      from: [located[i]!.lat!, located[i]!.lon!] as const,
      to: [h.lat!, h.lon!] as const,
    }));
    const { distanceKm } = computeSegments(inputs, 'line');
    // Sans l'inférence (GeoIP brut) on mesurait 44 634 km ; le chemin réel fait ~10 000 km.
    expect(distanceKm).toBeGreaterThan(8_000);
    expect(distanceKm).toBeLessThan(13_000);
  });

  it('conserve l’ASN et le nom d’AS de la base pour chaque saut public', () => {
    expect(byTtl.get(9)!.asn).toBe(174);
    expect(byTtl.get(18)!.asn).toBe(133618);
    expect(byTtl.get(18)!.asName).toBe('Trellian');
  });

  it('marque comme estimés les sauts dont la position ne vient que de la base', () => {
    expect(byTtl.get(7)!.estimated).toBe(false); // PTR par01
    expect(byTtl.get(16)!.estimated).toBe(true); // aucune info, seulement la base
  });
});

describe('ancrage sur la ville de d�part', () => {
  const GEO_FR = new Map<string, GeoHint>([
    ['80.15.224.25', { asn: 174, asName: 'Orange', country: 'FR', city: 'Paris', lat: 48.8566, lon: 2.3522 }],
  ]);
  const HOPS_FR = [hop(1, '80.15.224.25', null, 4)];

  it('ram�ne un premier saut � faible latence sur l�ancre', () => {
    const [h] = inferPath({ hops: HOPS_FR, geo: GEO_FR, anchor: { lat: 43.5513, lon: 7.0128, city: 'Cannes' } });
    expect(h!.city).toBe('Cannes');
    expect(h!.lat).toBeCloseTo(43.5513, 4);
    expect(h!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('ne d�place pas un saut � forte latence', () => {
    const [h] = inferPath({ hops: [hop(2, '80.15.224.25', null, 95)], geo: GEO_FR, anchor: { lat: 43.5513, lon: 7.0128, city: 'Cannes' } });
    expect(h!.city).toBe('Paris');
  });

  it('sans ancre, garde la position de la base', () => {
    const [h] = inferPath({ hops: HOPS_FR, geo: GEO_FR });
    expect(h!.city).toBe('Paris');
  });
});
