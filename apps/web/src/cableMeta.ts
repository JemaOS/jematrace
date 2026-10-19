import { useEffect, useState } from 'react';

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
}

export interface CableInfo {
  id: string;
  name: string;
  length: string | null;
  owners: string | null;
  suppliers: string | null;
  rfs: string | null;
  rfsYear: number | null;
  landingPoints: CableLanding[];
  url: string | null;
  notes: string | null;
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