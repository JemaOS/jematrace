/**
 * Apparences du globe : les 11 entrées du site de référence, et pour chacune le
 * fond de carte 2D qui lui correspond (couleurs, filtre, câbles, frontières).
 */

/** Fournisseur de tuiles utilisé par le fond 2D. */
export type BasemapSource = 'plan' | 'nights';

export interface Basemap {
  /** `plan` = carte vectorielle claire ; `nights` = lumières nocturnes réelles. */
  source: BasemapSource;
  /** Filtre CSS appliqué au calque de tuiles. */
  filter: string;
  /** Couleur de fond, visible autour du monde et sous les tuiles. */
  background: string;
  /** Style des câbles sous-marins ; `glow` ajoute un halo. */
  cable: { color: string; weight: number; glow?: string };
  /** Opacité des lumières nocturnes posées sur les tuiles (mode Jour/Nuit). */
  lights?: number;
  /** Couleur des frontières internes tracées par-dessus (variantes + Frontières). */
  border?: string;
  /** Halo sous les segments de route : nécessaire sur les fonds sombres. */
  halo: boolean;
  /** Faux par défaut : le fond est sombre, donc palette de câbles claire. */
  light?: boolean;
}

/**
 * Palette des câbles sous-marins, reprise de la carte de référence
 * (map.kmcd.dev). Quatre états, chacun avec sa couleur, son opacité et son
 * épaisseur :
 *
 *  - `regular`       : câble déjà en service avant l'année affichée (cyan) ;
 *  - `isNew`         : mis en service cette année-là (orange) ;
 *  - `decommissioned`: retiré cette année-là (rouge) ;
 *  - `selected`      : câble ouvert dans la fiche (blanc).
 *
 * Les valeurs diffèrent en thème clair pour rester lisibles sur fond clair.
 */
export interface CablePaletteEntry {
  color: string;
  opacity: number;
  weight: number;
}

export interface CablePalette {
  regular: CablePaletteEntry;
  isNew: CablePaletteEntry;
  decommissioned: CablePaletteEntry;
  selected: CablePaletteEntry;
}

export function cablePalette(light: boolean): CablePalette {
  return light
    ? {
        regular: { color: '#00558a', opacity: 0.96, weight: 0.95 },
        isNew: { color: '#b86505', opacity: 1, weight: 1.5 },
        decommissioned: { color: '#dc2626', opacity: 0.92, weight: 1.35 },
        selected: { color: '#0f172a', opacity: 1, weight: 0.95 },
      }
    : {
        regular: { color: '#00f0ff', opacity: 0.7, weight: 0.95 },
        isNew: { color: '#ffa500', opacity: 1, weight: 1.5 },
        decommissioned: { color: '#f85149', opacity: 0.85, weight: 1.35 },
        selected: { color: '#ffffff', opacity: 1, weight: 0.95 },
      };
}

/** État d'un câble pour une année donnée. */
export function cableState(
  cable: { year: number; end: number | null },
  year: number,
  selected: boolean,
): keyof CablePalette {
  if (selected) return 'selected';
  if (cable.end !== null && cable.end <= year) return 'decommissioned';
  if (cable.year === year) return 'isNew';
  return 'regular';
}

export interface Look {
  id: string;
  label: string;
  /** Couleur de l'océan (la sphère). */
  ocean: string;
  /** Couleur des côtes. */
  land: string;
  /** Couleur des frontières internes (utilisée si `borders`). */
  borders: boolean;
  /** Couleur du fond de la scène. */
  background: string;
  /** Opacité du halo atmosphérique. */
  glow: number;
  /** Couleur des étoiles. */
  stars: string;
  /** Fond utilisé par la carte 2D. */
  basemap: Basemap;
}

// --------------------------------------------------------------- fonds 2D

/** Vectoriel moderne : carte bleu nuit, comme la sphère. */
const VECTOR: Basemap = {
  source: 'plan',
  filter: 'invert(1) hue-rotate(185deg) brightness(0.72) saturate(1.5) contrast(0.95)',
  background: '#12222e',
  cable: { color: '#5b5bf0', weight: 1.2 },
  halo: false,
};

/** Noir : carte en niveaux de gris, sans couleur. */
const NOIR: Basemap = {
  source: 'plan',
  filter: 'invert(1) grayscale(1) brightness(0.58) contrast(1.25)',
  background: '#050506',
  cable: { color: '#8b98a8', weight: 1.3 },
  halo: false,
};

/** Atlas : vraies couleurs de carte, terres claires et mers bleues. */
const ATLAS: Basemap = {
  source: 'plan',
  filter: 'saturate(0.92) contrast(1.02)',
  background: '#0d2137',
  cable: { color: '#5b5bf0', weight: 1.6 },
  halo: false,
  // Fond de carte clair : les câbles doivent être foncés pour rester lisibles.
  light: true,
};

/** Nuit : lumières urbaines réelles, océans éteints. */
const NUIT: Basemap = {
  source: 'nights',
  filter: 'brightness(1.12) saturate(1.22) contrast(1.05)',
  background: '#04070f',
  cable: { color: '#7b7bf5', weight: 1.6, glow: '#5b5bf0' },
  halo: true,
};

/** Soleil : carte réchauffée, dorée. */
const SOLEIL: Basemap = {
  source: 'plan',
  filter: 'saturate(1.35) sepia(0.3) hue-rotate(-12deg) brightness(1.04) contrast(1.03)',
  background: '#2a2416',
  cable: { color: '#b5461f', weight: 1.6 },
  halo: false,
  light: true,
};

/** Jour/Nuit : carte assombrie recouverte des lumières des villes. */
const JOUR_NUIT: Basemap = {
  source: 'plan',
  filter: 'invert(1) hue-rotate(200deg) brightness(0.95) saturate(1.1)',
  background: '#080f1c',
  cable: { color: '#7b7bf5', weight: 1.6, glow: '#5b5bf0' },
  lights: 0.5,
  halo: true,
};

// ------------------------------------------------------------- apparences

export const LOOKS: readonly Look[] = [
  { id: 'vector', label: 'Vectoriel (moderne)', ocean: '#08131f', land: '#152c42', borders: true, background: '#04070d', glow: 0.5, stars: '#ffffff', basemap: VECTOR },
  { id: '0', label: 'Noir', ocean: '#04070d', land: '#54606e', borders: false, background: '#000000', glow: 0.03, stars: '#5a6675', basemap: NOIR },
  { id: '1', label: 'Noir + Frontières', ocean: '#04070d', land: '#54606e', borders: true, background: '#000000', glow: 0.03, stars: '#5a6675', basemap: { ...NOIR, border: 'rgba(205,220,240,0.45)' } },
  { id: '4', label: 'Atlas', ocean: '#0d2137', land: '#7fb2d8', borders: false, background: '#050a12', glow: 0.12, stars: '#a8c8e8', basemap: ATLAS },
  { id: '5', label: 'Atlas + Frontières', ocean: '#0d2137', land: '#7fb2d8', borders: true, background: '#050a12', glow: 0.12, stars: '#a8c8e8', basemap: { ...ATLAS, border: 'rgba(28,78,136,0.6)' } },
  { id: '3', label: 'Nuit', ocean: '#071220', land: '#142a40', borders: false, background: '#02040a', glow: 0.06, stars: '#ffffff', basemap: NUIT },
  { id: '6', label: 'Nuit + Frontières', ocean: '#071220', land: '#142a40', borders: true, background: '#02040a', glow: 0.06, stars: '#ffffff', basemap: { ...NUIT, border: 'rgba(108,168,255,0.45)' } },
  { id: '10', label: 'Soleil', ocean: '#1a2b1f', land: '#d8c07f', borders: false, background: '#0a0f08', glow: 0.05, stars: '#e8d9a0', basemap: SOLEIL },
  { id: '11', label: 'Soleil + Frontières', ocean: '#1a2b1f', land: '#d8c07f', borders: true, background: '#0a0f08', glow: 0.05, stars: '#e8d9a0', basemap: { ...SOLEIL, border: 'rgba(92,58,18,0.55)' } },
  { id: '12', label: 'Jour/Nuit', ocean: '#122033', land: '#c9d6e2', borders: false, background: '#060a12', glow: 0.08, stars: '#dbe6f2', basemap: JOUR_NUIT },
  { id: '13', label: 'Jour/Nuit + Frontières', ocean: '#122033', land: '#c9d6e2', borders: true, background: '#060a12', glow: 0.08, stars: '#dbe6f2', basemap: { ...JOUR_NUIT, border: 'rgba(108,168,255,0.45)' } },
];

export function lookById(id: string): Look {
  return LOOKS.find((look) => look.id === id) ?? LOOKS[0]!;
}
