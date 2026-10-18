import { describe, expect, it } from 'vitest';

import { polylineLength, type LatLon } from '@geotrace/geo';

import {
  buildCableGraph,
  CABLE_CONNECT_KM,
  CABLE_REACH_KM,
  CABLE_THRESHOLD_KM,
  LANDING_PENALTY,
  routeHop,
  type Cable,
} from '../src/index';

/**
 * Deux câbles synthétiques qui se rejoignent au milieu de l'Atlantique et
 * plongent vers le sud : le trajet le long des câbles doit donc être plus long
 * que la ligne droite, exactement comme sur la route réelle (13 758 km contre 9 645 km).
 */
const CABLES: Cable[] = [
  { name: 'ATL-NORD', points: [[-5, 48], [-15, 44], [-28, 42], [-32, 42]] },
  { name: 'ATL-SUD', points: [[-33, 42], [-45, 40], [-60, 39], [-72, 41]] },
];

const graph = buildCableGraph(CABLES);

const EUROPE: LatLon = [48.5, -5];
const AMERIQUE: LatLon = [41, -72];

describe('constantes', () => {
  it('reprend celles du site de référence', () => {
    expect(CABLE_THRESHOLD_KM).toBe(1000);
    expect(CABLE_CONNECT_KM).toBe(300);
    expect(LANDING_PENALTY).toBe(3);
  });
});

describe('buildCableGraph', () => {
  it('crée un nœud par point de câble', () => {
    expect(graph.nodes).toHaveLength(8);
  });

  it('rattache chaque nœud à son ou ses câbles', () => {
    expect([...graph.nodes[0]!.cables]).toEqual(['ATL-NORD']);
    expect([...graph.nodes[7]!.cables]).toEqual(['ATL-SUD']);
  });

  it('relie les points consécutifs d’un même câble', () => {
    expect(graph.nodes[0]!.links.some((l) => l.to === 1)).toBe(true);
  });

  it('relie deux câbles différents quand leurs extrémités sont proches', () => {
    const joint = graph.nodes[3]!;
    expect(joint.links.some((l) => l.to === 4)).toBe(true);
  });
});

describe('routeHop', () => {
  it('suit les câbles et renvoie une polyligne partant et arrivant aux bons points', () => {
    const path = routeHop(graph, EUROPE, AMERIQUE);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(EUROPE);
    expect(path![path!.length - 1]).toEqual(AMERIQUE);
    expect(path!.length).toBeGreaterThan(4);
  });

  it('produit une distance supérieure à la ligne droite', () => {
    const path = routeHop(graph, EUROPE, AMERIQUE)!;
    const direct = polylineLength([EUROPE, AMERIQUE]);
    expect(polylineLength(path)).toBeGreaterThan(direct);
  });

  it('ne route pas un saut court (sous le seuil)', () => {
    // Paris → Marseille : ~660 km, bien en dessous des 1000 km.
    expect(routeHop(graph, [48.85, 2.35], [43.3, 5.37])).toBeNull();
  });

  it('cherche l’atterrissage plus loin que la jonction câble-à-câble', () => {
    // ~520 km à l'est du premier nœud : au-delà des 300 km de CABLE_CONNECT_KM,
    // mais dans la portée d'atterrissage — une ville peut être loin de la mer.
    expect(CABLE_REACH_KM).toBeGreaterThan(CABLE_CONNECT_KM);
    expect(routeHop(graph, [48, 2], AMERIQUE)).not.toBeNull();
  });

  it('renvoie null si aucun câble n’est à portée', () => {
    // Plein Pacifique, à des milliers de km de tout câble du jeu de test.
    expect(routeHop(graph, [-20, -140], [-20, -130])).toBeNull();
  });

  it('renvoie null sur un graphe vide', () => {
    expect(routeHop({ nodes: [] }, EUROPE, AMERIQUE)).toBeNull();
  });
});
