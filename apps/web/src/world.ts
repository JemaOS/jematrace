/**
 * Données du monde : contours (Natural Earth, domaine public), câbles
 * sous-marins (TeleGeography, CC BY-NC-SA, usage non commercial + attribution)
 * et villes. Chargées à la demande et mises en cache au niveau du module.
 */

export interface WorldData {
  land: number[][][];
  countries: number[][][];
}

export interface CableLine {
  name: string;
  points: Array<[number, number]>;
}

export interface CableLanding {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export interface CableWorld {
  cables: CableLine[];
  landings: CableLanding[];
}

/** Une ville : `[lat, lon, population]` (triée par population décroissante). */
export type CityPoint = [number, number, number];

let worldCache: Promise<WorldData> | null = null;
let cableCache: Promise<CableWorld> | null = null;
let cityCache: Promise<CityPoint[]> | null = null;

export function loadWorld(): Promise<WorldData> {
  worldCache ??= fetch('/world/world-110m.json').then(async (res) => {
    if (!res.ok) throw new Error(`world-110m.json : HTTP ${res.status}`);
    return (await res.json()) as WorldData;
  });
  return worldCache;
}

export function loadCables(): Promise<CableWorld> {
  cableCache ??= fetch('/world/cables.geo.json')
    .then(async (res) => (res.ok ? ((await res.json()) as CableWorld) : { cables: [], landings: [] }))
    .catch(() => ({ cables: [], landings: [] }));
  return cableCache;
}

export function loadCities(): Promise<CityPoint[]> {
  cityCache ??= fetch('/world/cities.json')
    .then(async (res) => (res.ok ? ((await res.json()) as CityPoint[]) : []))
    .catch(() => []);
  return cityCache;
}
