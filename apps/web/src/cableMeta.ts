import { useEffect, useState } from 'react';

import { loadCables } from './world';

/**
 * Fiches des câbles sous-marins.
 *
 * La géométrie (`cables.geo.json`) ne contient que le nom et le tracé ; les
 * informations d'une fiche (propriétaires, fournisseur, mise en service,
 * longueur, points d'atterrissage, lien officiel) viennent de
 * `cable-meta.json`, généré par `tools/fetch-cable-meta.mjs` depuis l'API
 * publique de TeleGeography (même source, CC BY-NC-SA).
 *
 * Le fichier est chargé à la première ouverture d'une fiche, puis conservé :
 * inutile de le télécharger pour quelqu'un qui ne clique jamais sur un câble.
 */

export interface CableLanding {
  name: string;
  country: string | null;
  /** Coordonnées de l'atterrissage : la fiche peut y ramener la carte. */
  lat: number | null;
  lon: number | null;
}

export interface CableInfo {
  name: string;
  /** Année de mise en service (1858 pour le premier câble transatlantique). */
  year: number;
  /** Année de retrait, ou null si le câble est toujours en service. */
  end: number | null;
  length: string | null;
  capacity: string | null;
  owners: string | null;
  suppliers: string | null;
  rfs: string | null;
  url: string | null;
  description: string | null;
  landingPoints: CableLanding[];
  /** Technologie déclarée (fiber-optic, coax, telegraph…), ou `null`. */
  technology: string | null;
}

export type CableMetaFile = Record<string, CableInfo>;

let cache: CableMetaFile | null = null;
let loading: Promise<CableMetaFile> | null = null;

/** Charge (une seule fois) toutes les fiches. */
export function loadCableMeta(): Promise<CableMetaFile> {
  if (cache) return Promise.resolve(cache);
  loading ??= fetch('/world/cable-meta.json')
    .then(async (res) => (res.ok ? ((await res.json()) as CableMetaFile) : {}))
    .then((data) => {
      cache = data;
      return data;
    })
    .catch(() => {
      cache = {};
      return cache;
    });
  return loading;
}

/**
 * Fiche d'un câble, ou `null` s'il n'y en a pas (certains tronçons du jeu de
 * données n'ont pas de fiche côté TeleGeography).
 */
export function useCableInfo(name: string | null): { info: CableInfo | null; ready: boolean } {
  const [info, setInfo] = useState<CableInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!name) {
      setInfo(null);
      setReady(false);
      return;
    }
    let alive = true;
    setReady(false);
    void loadCableMeta().then((all) => {
      if (!alive) return;
      setInfo(all[name] ?? null);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [name]);

  return { info, ready };
}

/**
 * Aperçu du tracé d'un câble, en SVG.
 *
 * La carte de référence affiche une vignette du tracé dans sa fiche : elle
 * permet de reconnaître un câble d'un coup d'œil. On projette les points en
 * Mercator simplifié et on normalise dans une boîte de 120 × 60.
 */
export function useCableShape(name: string | null): string | null {
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    if (!name) {
      setPath(null);
      return;
    }
    let alive = true;
    void loadCables().then((world) => {
      if (!alive) return;
      const cable = world.cables.find((c) => c.name === name);
      if (!cable) {
        setPath(null);
        return;
      }

      // Toutes les lignes, projetées puis bornées ensemble.
      const all: Array<[number, number]> = [];
      for (const line of cable.lines) {
        for (const [lon, lat] of line) {
          all.push([lon, Math.max(-80, Math.min(80, lat))]);
        }
      }
      if (all.length < 2) {
        setPath(null);
        return;
      }

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [x, y] of all) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      const W = 120;
      const H = 60;
      const spanX = Math.max(0.001, maxX - minX);
      const spanY = Math.max(0.001, maxY - minY);
      const scale = Math.min((W - 8) / spanX, (H - 8) / spanY);
      const offX = (W - spanX * scale) / 2;
      const offY = (H - spanY * scale) / 2;

      // Une seule sous-route par ligne, pour ne pas relier des tronçons
      // séparés par une ligne droite artificielle.
      const parts: string[] = [];
      for (const line of cable.lines) {
        if (line.length < 2) continue;
        const d = line
          .map(([lon, lat], i) => {
            const x = offX + (lon - minX) * scale;
            const y = offY + (maxY - Math.max(-80, Math.min(80, lat))) * scale;
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ');
        parts.push(d);
      }

      setPath(parts.length > 0 ? parts.join(' ') : null);
    });
    return () => {
      alive = false;
    };
    // `color` ne sert qu'au rendu, pas au calcul.
  }, [name]);

  return path;
}
