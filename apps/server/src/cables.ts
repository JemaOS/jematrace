/**
 * Chargement du réseau de câbles sous-marins pour le mode « Topo ».
 *
 * Le fichier attendu est `data/cables/cables.json`, au format :
 *   { "cables": [ { "name": "…", "points": [[lon, lat], …] }, … ] }
 *
 * Il n'est pas livré avec le dépôt : les données TeleGeography sont en
 * CC BY-NC-SA (usage non commercial, attribution). Voir le README.
 * En son absence, on renvoie `null` et le mode Topo retombe sur les grands cercles.
 */

import { buildCableGraph, routeHop, type Cable, type CableGraph } from '@geotrace/cable-routing';
import type { LatLon } from '@geotrace/geo';

import { readFileSync } from 'node:fs';

import { findDataFile } from './data.js';

let loaded: CableGraph | null | undefined;

function load(): CableGraph | null {
  if (loaded !== undefined) return loaded;

  const file = findDataFile('data/cables/cables.json', import.meta.url);
  if (file) {
    try {
      const raw = readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw) as { cables?: Cable[] };
      if (Array.isArray(parsed.cables) && parsed.cables.length > 0) {
        loaded = buildCableGraph(parsed.cables);
        return loaded;
      }
    } catch {
      // Fichier illisible : on retombe sur les grands cercles.
    }
  }

  loaded = null;
  return loaded;
}

/** Nombre de câbles chargés (0 si aucun fichier). */
export function cableCount(): number {
  const graph = load();
  return graph ? graph.nodes.length : 0;
}

/**
 * Trajet le long des câbles entre deux villes, ou `null` si les câbles ne sont
 * pas disponibles ou qu'aucun chemin plausible n'existe.
 */
export function cablePath(from: LatLon, to: LatLon): LatLon[] | null {
  const graph = load();
  if (!graph) return null;
  return routeHop(graph, from, to);
}
