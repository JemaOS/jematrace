/**
 * Routage le long des câbles sous-marins (mode « Topo »).
 *
 * Reproduit le comportement du site de référence : quand un saut est assez long,
 * on cherche un chemin qui suit réellement des câbles, en pénalisant les portions
 * terrestres. C'est ce qui explique la distance plus grande qu'en ligne droite
 * (13 758 km contre 9 645 km sur la route de référence).
 *
 * Constantes reprises de l'original :
 *   CABLE_THRESHOLD_KM = 1000  → en dessous, on ne tente pas les câbles
 *   CABLE_CONNECT_KM   = 300   → deux extrémités de câbles sont reliées si plus proches
 *   LANDING_PENALTY    = 3     → les extrémités terrestres coûtent 3×
 *   MAX_INTRA_COUNTRY_KM = 8300 → on ne traverse pas un pays sur une trop longue distance
 */

import { haversine, type LatLon } from '@geotrace/geo';

export interface Cable {
  name: string;
  /** Points `[lon, lat]`, dans l'ordre. */
  points: Array<[number, number]>;
}

export const CABLE_THRESHOLD_KM = 1000;
export const CABLE_CONNECT_KM = 300;
export const LANDING_PENALTY = 3;
export const MAX_INTRA_COUNTRY_KM = 8300;
/**
 * Rayon dans lequel on cherche le point d'atterrissage le plus proche d'une
 * extrémité. Plus large que `CABLE_CONNECT_KM` : une ville peut être loin de la
 * mer (Paris, Atlanta…), la fibre terrestre qui la relie au câble est longue.
 * La pénalité d'atterrissage évite qu'un détour trop long l'emporte.
 */
export const CABLE_REACH_KM = 800;
/** Deux points de câbles distincts sont fusionnés s'ils sont plus proches que ça. */
export const MERGE_KM = 30;

interface Node {
  lat: number;
  lon: number;
  /** Câbles auxquels ce point appartient. */
  cables: Set<string>;
  /** Voisins directs (même câble) avec leur distance. */
  links: Array<{ to: number; km: number }>;
}

export interface CableGraph {
  nodes: Node[];
}

/** `[lon, lat]` → `[lat, lon]`, la convention du reste du projet. */
function toLatLon(p: [number, number]): LatLon {
  return [p[1], p[0]];
}

/** Construit le graphe : un nœud par point, fusionné s'il est très proche d'un autre. */
export function buildCableGraph(cables: readonly Cable[]): CableGraph {
  const nodes: Node[] = [];
  const grid = new Map<string, number[]>();
  const CELL = 0.5; // ~55 km

  const cellKey = (lat: number, lon: number) => `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;

  const findOrCreate = (lat: number, lon: number): number => {
    const k = cellKey(lat, lon);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${Math.floor(lat / CELL) + dx}:${Math.floor(lon / CELL) + dy}`);
        if (!bucket) continue;
        for (const idx of bucket) {
          const n = nodes[idx]!;
          if (haversine([n.lat, n.lon], [lat, lon]) <= MERGE_KM) return idx;
        }
      }
    }
    const index = nodes.length;
    nodes.push({ lat, lon, cables: new Set(), links: [] });
    const bucket = grid.get(k);
    if (bucket) bucket.push(index);
    else grid.set(k, [index]);
    return index;
  };

  for (const cable of cables) {
    let previous = -1;
    for (const point of cable.points) {
      const [lat, lon] = toLatLon(point);
      const index = findOrCreate(lat, lon);
      nodes[index]!.cables.add(cable.name);
      if (previous >= 0 && previous !== index) {
        const km = haversine([nodes[previous]!.lat, nodes[previous]!.lon], [lat, lon]);
        nodes[previous]!.links.push({ to: index, km });
        nodes[index]!.links.push({ to: previous, km });
      }
      previous = index;
    }
  }

  // Connexions entre câbles différents : extrémités proches (< CABLE_CONNECT_KM).
  // Grille spatiale pour éviter une passe en O(n²) sur des milliers de nœuds.
  const CELL_CONNECT = 3; // degrés (~333 km)
  const connectGrid = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const k = `${Math.floor(n.lat / CELL_CONNECT)}:${Math.floor(n.lon / CELL_CONNECT)}`;
    const bucket = connectGrid.get(k);
    if (bucket) bucket.push(i);
    else connectGrid.set(k, [i]);
  });

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    const cx = Math.floor(a.lat / CELL_CONNECT);
    const cy = Math.floor(a.lon / CELL_CONNECT);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = connectGrid.get(`${cx + dx}:${cy + dy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i) continue;
          const b = nodes[j]!;
          const km = haversine([a.lat, a.lon], [b.lat, b.lon]);
          if (km > CABLE_CONNECT_KM) continue;
          const different = [...a.cables].some((c) => !b.cables.has(c));
          if (!different) continue;
          a.links.push({ to: j, km });
          b.links.push({ to: i, km });
        }
      }
    }
  }

  return { nodes };
}

/** Nœuds candidats autour d'un point, dans un rayon donné. */
function nodesNear(graph: CableGraph, at: LatLon, radiusKm: number): Array<{ index: number; km: number }> {
  const out: Array<{ index: number; km: number }> = [];
  graph.nodes.forEach((n, index) => {
    const km = haversine(at, [n.lat, n.lon]);
    if (km <= radiusKm) out.push({ index, km });
  });
  return out.sort((a, b) => a.km - b.km);
}

/**
 * Cherche un trajet le long des câbles entre deux points.
 * Renvoie la polyligne `[lat, lon]`, ou `null` si aucun trajet plausible n'existe.
 */
export function routeHop(graph: CableGraph, from: LatLon, to: LatLon): LatLon[] | null {
  if (graph.nodes.length === 0) return null;
  const direct = haversine(from, to);
  if (direct < CABLE_THRESHOLD_KM) return null;

  const entries = nodesNear(graph, from, CABLE_REACH_KM);
  const exits = nodesNear(graph, to, CABLE_REACH_KM);
  if (entries.length === 0 || exits.length === 0) return null;

  const exitSet = new Map(exits.map((e) => [e.index, e.km]));
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open: Array<{ index: number; f: number; g: number }> = [];

  for (const entry of entries) {
    const g = entry.km * LANDING_PENALTY;
    gScore.set(entry.index, g);
    open.push({ index: entry.index, f: g + haversine([graph.nodes[entry.index]!.lat, graph.nodes[entry.index]!.lon], to) * LANDING_PENALTY, g });
  }

  const visited = new Set<number>();
  let goal: number | null = null;

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    if (visited.has(current.index)) continue;
    visited.add(current.index);

    if (exitSet.has(current.index)) {
      goal = current.index;
      break;
    }

    const node = graph.nodes[current.index]!;
    for (const link of node.links) {
      if (visited.has(link.to)) continue;
      const target = graph.nodes[link.to]!;
      if (haversine([node.lat, node.lon], [target.lat, target.lon]) > MAX_INTRA_COUNTRY_KM) continue;

      // Un changement de câble coûte plus cher qu'une progression sur le même câble.
      const transfer =
        [...node.cables].some((c) => target.cables.has(c)) ? 1 : LANDING_PENALTY;
      const tentative = current.g + link.km * transfer;
      const known = gScore.get(link.to);
      if (known !== undefined && tentative >= known) continue;

      gScore.set(link.to, tentative);
      cameFrom.set(link.to, current.index);
      const heuristic = haversine([target.lat, target.lon], to) * LANDING_PENALTY;
      open.push({ index: link.to, f: tentative + heuristic, g: tentative });
    }
  }

  if (goal === null) return null;

  const path: LatLon[] = [];
  for (let at: number | undefined = goal; at !== undefined; at = cameFrom.get(at)) {
    const n = graph.nodes[at]!;
    path.push([n.lat, n.lon]);
  }
  path.reverse();

  const exitKm = exitSet.get(goal) ?? 0;
  return [from, ...path, to, ...(exitKm > 0 ? [] : [])];
}
