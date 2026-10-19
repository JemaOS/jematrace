import { describe, expect, it } from 'vitest';

import type { ResolvedHop } from '@jematrace/shared';

import {
  computeSegments,
  groupByCity,
  groupPathDistanceKm,
  haversine,
  lastRespondingRttMs,
  polylineLength,
  withRttDeltas,
  type LatLon,
} from '../src/index';

/** Centroïdes exacts utilisés par le site de référence (relevés dans son cache de routes). */
const MARSEILLE: LatLon = [43.29695, 5.38107];
const BEAU_BASSIN: LatLon = [-20.23325, 57.46609];
const FRANKFURT: LatLon = [50.1109, 8.6821];
const PORT_LOUIS: LatLon = [-20.1619, 57.5012];

function hop(ttl: number, city: string, coords: LatLon, rttMs: number, asn: number | null): ResolvedHop {
  return {
    ttl,
    ip: `10.0.0.${ttl}`,
    host: null,
    rttMs,
    asn,
    asName: null,
    country: city === 'Marseille' ? 'FR' : city === 'Frankfurt' ? 'DE' : 'MU',
    continent: 'EU',
    city,
    lat: coords[0],
    lon: coords[1],
    confidence: 0.9,
    private: false,
    estimated: false,
  };
}

/** Route réelle du site : Francfort → Marseille → Beau Bassin → Port-Louis. */
const ROUTE: ResolvedHop[] = [
  hop(1, 'Frankfurt', FRANKFURT, 4, 62240),
  hop(2, 'Marseille', MARSEILLE, 40, 1299),
  hop(3, 'Beau Bassin-rose Hill', BEAU_BASSIN, 239, 3356),
  hop(4, 'Beau Bassin-rose Hill', BEAU_BASSIN, 243, 3356),
  hop(5, 'Beau Bassin-rose Hill', BEAU_BASSIN, 228, 23889),
  hop(6, 'Beau Bassin-rose Hill', BEAU_BASSIN, 230, 37722),
  hop(7, 'Beau Bassin-rose Hill', BEAU_BASSIN, 229, 0),
  hop(8, 'Beau Bassin-rose Hill', BEAU_BASSIN, 231, 328699),
  hop(9, 'Port-louis', PORT_LOUIS, 228, 328699),
];

describe('haversine', () => {
  it('vaut 0 pour un point identique', () => {
    expect(haversine(MARSEILLE, MARSEILLE)).toBe(0);
  });

  it('reproduit les distances mesurées sur le site (±15 km)', () => {
    // Valeurs affichées par le site : 800 km, 8848 km, 9 km.
    expect(Math.abs(haversine(FRANKFURT, MARSEILLE) - 800)).toBeLessThan(15);
    expect(Math.abs(haversine(MARSEILLE, BEAU_BASSIN) - 8848)).toBeLessThan(15);
    expect(Math.abs(haversine(BEAU_BASSIN, PORT_LOUIS) - 9)).toBeLessThan(15);
  });
});

describe('polylineLength', () => {
  it('somme les tronçons', () => {
    expect(polylineLength([FRANKFURT, MARSEILLE, BEAU_BASSIN])).toBeCloseTo(
      haversine(FRANKFURT, MARSEILLE) + haversine(MARSEILLE, BEAU_BASSIN),
      9,
    );
  });
});

describe('computeSegments', () => {
  const inputs = [
    { from: FRANKFURT, to: MARSEILLE },
    { from: MARSEILLE, to: BEAU_BASSIN },
    { from: BEAU_BASSIN, to: PORT_LOUIS },
  ];

  it('en mode Ligne, suit les grands cercles', () => {
    const { distanceKm, segments } = computeSegments(inputs, 'line');
    expect(segments).toHaveLength(3);
    expect(Math.abs(distanceKm - 9645)).toBeLessThan(15);
  });

  it('en mode Topo, suit la polyligne de câble quand elle existe et allonge la distance', () => {
    const detour: LatLon[] = [MARSEILLE, [37.0, 10.0], [-5.0, 30.0], BEAU_BASSIN];
    const { distanceKm, segments } = computeSegments(
      [{ ...inputs[0]! }, { ...inputs[1]!, cablePolyline: detour }, { ...inputs[2]! }],
      'topo',
    );
    const lineDistance = computeSegments(inputs, 'line').distanceKm;
    expect(distanceKm).toBeGreaterThan(lineDistance);
    expect(segments[1]!.km).toBeCloseTo(polylineLength(detour), 9);
    // Le détour doit produire l'ordre de grandeur de l'écart mesuré (13 758 vs 9 645).
    expect(segments[1]!.km).toBeGreaterThan(haversine(MARSEILLE, BEAU_BASSIN));
  });

  it('en mode Topo sans polyligne, retombe sur le grand cercle', () => {
    const topo = computeSegments(inputs, 'topo').distanceKm;
    const line = computeSegments(inputs, 'line').distanceKm;
    expect(topo).toBeCloseTo(line, 9);
  });
});

describe('withRttDeltas', () => {
  it('calcule la hausse de RTT entre les bornes de chaque segment', () => {
    const { segments } = computeSegments(
      [
        { from: FRANKFURT, to: MARSEILLE },
        { from: MARSEILLE, to: BEAU_BASSIN },
      ],
      'line',
    );
    const deltas = withRttDeltas(segments, [4, 40, 228]);
    expect(deltas[0]!.rttDeltaMs).toBe(36);
    expect(deltas[1]!.rttDeltaMs).toBe(188);
  });
});

describe('groupByCity', () => {
  const groups = groupByCity(ROUTE);

  it('fusionne les sauts consécutifs de la même ville', () => {
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.city)).toEqual([
      'Frankfurt',
      'Marseille',
      'Beau Bassin-rose Hill',
      'Port-louis',
    ]);
    expect(groups[2]!.hops).toHaveLength(6);
  });

  it('affiche la latence minimale du groupe (228 ms, pas 243 ms)', () => {
    expect(groups.map((g) => g.rttMs)).toEqual([4, 40, 228, 228]);
  });

  it('calcule la distance depuis la ville précédente et la somme cohérente', () => {
    expect(groups[0]!.kmFromPrev).toBe(0);
    expect(Math.abs(groups[1]!.kmFromPrev - 800)).toBeLessThan(15);
    expect(Math.abs(groups[2]!.kmFromPrev - 8848)).toBeLessThan(15);
    expect(Math.abs(groups[3]!.kmFromPrev - 9)).toBeLessThan(15);
    // Contrôle croisé : la somme des segments ≈ la distance « Ligne » du site (9 645 km).
    expect(Math.abs(groupPathDistanceKm(groups) - 9645)).toBeLessThan(20);
  });

  it('numérote les groupes à partir de 1', () => {
    expect(groups.map((g) => g.i)).toEqual([1, 2, 3, 4]);
  });
});

describe('lastRespondingRttMs', () => {
  it('renvoie le RTT du dernier saut qui répond (228 ms)', () => {
    expect(lastRespondingRttMs(ROUTE)).toBe(228);
  });

  it('ignore les sauts muets en fin de trace', () => {
    const withTrailingSilence: ResolvedHop[] = [
      ...ROUTE,
      { ...ROUTE[8]!, ttl: 10, rttMs: 0 },
    ];
    expect(lastRespondingRttMs(withTrailingSilence)).toBe(228);
  });
});
