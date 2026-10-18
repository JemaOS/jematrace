import { describe, expect, it } from 'vitest';

import {
  gradientCSS,
  hex,
  leniency,
  NEUTRAL_RGB,
  pathSpeed,
  PHYS_MAX_KMS,
  segmentRGB,
  speed,
  SPEED_STOPS,
  speedRGB,
} from '../src/index';

/**
 * Cas de référence mesurés sur le site d'origine, même traceroute, même RTT final (228 ms) :
 *   mode Topo  (le long des câbles)      : 13 758 km → 120 683 km/s
 *   mode Ligne (grands cercles)          :  9 645 km →  84 608 km/s
 * La distance interne est fractionnaire ; la vitesse affichée est arrondie.
 */
const RTT_FINAL_MS = 228;

describe('vitesse de chemin (formule vérifiée)', () => {
  it('reproduit la mesure affichée en mode Topo', () => {
    const internalKm = (120683 * RTT_FINAL_MS) / 2000; // 13 757,86…
    expect(Math.round(pathSpeed(internalKm, RTT_FINAL_MS))).toBe(120683);
  });

  it('reproduit la mesure affichée en mode Ligne', () => {
    const internalKm = (84608 * RTT_FINAL_MS) / 2000; // 9 645,31…
    expect(Math.round(pathSpeed(internalKm, RTT_FINAL_MS))).toBe(84608);
  });

  it('reste proche de la valeur affichée si l’on part de la distance arrondie', () => {
    // La distance interne est fractionnaire : arrondir à l'unité décale la vitesse
    // de 2 × 0,3 km/s environ. Tolérance de 5 km/s (< 0,01 %).
    expect(Math.abs(Math.round(pathSpeed(13758, RTT_FINAL_MS)) - 120683)).toBeLessThanOrEqual(5);
    expect(Math.abs(Math.round(pathSpeed(9645, RTT_FINAL_MS)) - 84608)).toBeLessThanOrEqual(5);
  });

  it('la vitesse de chemin vaut 2000 × km / RTT', () => {
    expect(pathSpeed(1000, 100)).toBe(20000);
    expect(pathSpeed(1000, 0)).toBe(0);
    expect(pathSpeed(Number.NaN, 100)).toBe(0);
  });
});

describe('vitesse de segment', () => {
  it('vaut km × 2000 / ΔRTT', () => {
    expect(speed(1000, 10)).toBe(200000);
  });

  it('vaut 0 (inconnu) si le ΔRTT est nul ou négatif', () => {
    expect(speed(1000, 0)).toBe(0);
    expect(speed(1000, -5)).toBe(0);
  });
});

describe('compensation des sauts courts', () => {
  it('vaut 1 + 1500/km', () => {
    expect(leniency(1500)).toBe(2);
    expect(leniency(200)).toBeCloseTo(8.5, 10);
    expect(leniency(15000)).toBeCloseTo(1.1, 10);
  });

  it('vaut 1 pour une distance nulle ou invalide', () => {
    expect(leniency(0)).toBe(1);
    expect(leniency(Number.NaN)).toBe(1);
  });

  it('fait passer un saut court de « lent » à plus rapide', () => {
    const raw = speedRGB(speed(1000, 100)); // 20 000 km/s → rouge/orange
    const lenient = segmentRGB(1000, 100); // ×2,5 → 50 000 km/s → orange
    expect(raw[0]).toBe(hexToRgb('#ff4d4d')[0]);
    expect(lenient).not.toEqual(raw);
  });
});

function hexToRgb(h: string): [number, number, number] {
  return [
    Number.parseInt(h.slice(1, 3), 16),
    Number.parseInt(h.slice(3, 5), 16),
    Number.parseInt(h.slice(5, 7), 16),
  ];
}

describe('paliers de couleur', () => {
  it('couvre les 5 paliers, croissants en vitesse', () => {
    expect(SPEED_STOPS).toHaveLength(5);
    expect(SPEED_STOPS.map(([k]) => k)).toEqual([0, 40000, 90000, 150000, 210000]);
  });

  it('renvoie les couleurs exactes aux bornes', () => {
    // Note : `speedRGB(0)` vaut « inconnu » (gris) — comme l'original. Le rouge pur
    // (premier palier) n'est donc atteint que pour une vitesse strictement positive.
    expect(hex(speedRGB(1))).toBe('#ff4d4d');
    expect(hex(speedRGB(40000))).toBe('#ff9e2c');
    expect(hex(speedRGB(90000))).toBe('#ffe14d');
    expect(hex(speedRGB(150000))).toBe('#8adc4e');
    expect(hex(speedRGB(210000))).toBe('#aeff71');
  });

  it('interpole entre deux paliers', () => {
    const mid = speedRGB(20000);
    expect(mid[0]).toBeCloseTo((0xff + 0xff) / 2, 6);
    expect(mid[1]).toBeCloseTo((0x4d + 0x9e) / 2, 6);
    expect(mid[2]).toBeCloseTo((0x4d + 0x2c) / 2, 6);
  });

  it('borne au-delà de la vitesse maximale', () => {
    expect(hex(speedRGB(10_000_000))).toBe('#aeff71');
  });

  it('renvoie le gris neutre pour une vitesse inconnue ou nulle', () => {
    expect(speedRGB(0)).toEqual(NEUTRAL_RGB);
    expect(speedRGB(-1)).toEqual(NEUTRAL_RGB);
    expect(speedRGB(Number.NaN)).toEqual(NEUTRAL_RGB);
  });

  it('expose la limite fibre à 210 000 km/s', () => {
    expect(PHYS_MAX_KMS).toBe(210000);
    expect(SPEED_STOPS[SPEED_STOPS.length - 1]![0]).toBe(PHYS_MAX_KMS);
  });
});

describe('légende', () => {
  it('produit un dégradé normalisé sur la vitesse maximale', () => {
    const css = gradientCSS();
    expect(css.startsWith('linear-gradient(to right, ')).toBe(true);
    expect(css).toContain('#ff4d4d 0.0%');
    expect(css).toContain('#aeff71 100.0%');
    expect((css.match(/#[0-9a-f]{6}/g) ?? []).length).toBe(5);
  });
});
