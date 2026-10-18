/**
 * Vitesse de propagation par segment → couleur.
 *
 * Comportement reproduit à l'identique depuis le site de référence
 * (fichier client `seg-speed.js`) : mêmes paliers, même compensation des
 * sauts courts, même couleur « inconnu ». On réimplémente la règle, on ne
 * copie aucun fichier.
 *
 *   vitesse segment = (km * 2000) / ΔRTT_ms      (km/s)
 *   ΔRTT <= 0 ou km non fini → 0 = « inconnu »
 */

export type RGB = readonly [number, number, number];

/**
 * Paliers `[km/s, rgb]`, croissants en vitesse : lent → rapide.
 * rouge → orange → jaune → vert (≈ vitesse de la lumière en fibre).
 */
export const SPEED_STOPS: ReadonlyArray<readonly [number, RGB]> = [
  [0, [0xff, 0x4d, 0x4d]], // très lent
  [40000, [0xff, 0x9e, 0x2c]], // orange
  [90000, [0xff, 0xe1, 0x4d]], // jaune
  [150000, [0x8a, 0xdc, 0x4e]], // jaune-vert
  [210000, [0xae, 0xff, 0x71]], // très rapide — limite fibre ≈ 2/3 c
];

/** Vitesse inconnue : gris ardoise, volontairement distinct des deux extrémités. */
export const NEUTRAL_RGB: RGB = [0x8b, 0x94, 0x9e];

/** Référence de compensation des sauts courts (km). */
export const LENIENCY_REF_KM = 1500;

/** Au-delà, la vitesse implicite est physiquement impossible (km/s). */
export const PHYS_MAX_KMS = 210000;

/** Vitesse d'un segment (km/s). `0` = inconnue. */
export function speed(km: number, dRttMs: number): number {
  return dRttMs > 0 && Number.isFinite(km) ? (km * 2000) / dRttMs : 0;
}

/** Vitesse de l'ensemble du chemin (km/s) à partir de la distance et du RTT final. */
export function pathSpeed(km: number, lastRttMs: number): number {
  return lastRttMs > 0 && Number.isFinite(km) ? (km * 2000) / lastRttMs : 0;
}

/**
 * Sur un saut court, la hausse de RTT est dominée par le traitement et la
 * gigue plutôt que par la propagation : on compense d'autant plus que le saut
 * est court. `factor = 1 + 1500 / km` (≈ 9× à 200 km, 2× à 1500 km, 1,1× à 15 000 km).
 */
export function leniency(km: number): number {
  return Number.isFinite(km) && km > 0 ? 1 + LENIENCY_REF_KM / km : 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** km/s → RGB (0..255). Vitesse inconnue → gris neutre. */
export function speedRGB(kmps: number): RGB {
  if (!Number.isFinite(kmps) || kmps <= 0) return NEUTRAL_RGB;
  const first = SPEED_STOPS[0]!;
  if (kmps <= first[0]) return first[1];
  for (let i = 1; i < SPEED_STOPS.length; i++) {
    const prev = SPEED_STOPS[i - 1]!;
    const cur = SPEED_STOPS[i]!;
    if (kmps <= cur[0]) {
      const t = (kmps - prev[0]) / (cur[0] - prev[0]);
      return [
        lerp(prev[1][0], cur[1][0], t),
        lerp(prev[1][1], cur[1][1], t),
        lerp(prev[1][2], cur[1][2], t),
      ];
    }
  }
  return SPEED_STOPS[SPEED_STOPS.length - 1]![1];
}

/** Couleur d'un segment : distance + hausse de RTT, avec compensation des sauts courts. */
export function segmentRGB(km: number, dRttMs: number): RGB {
  return speedRGB(speed(km, dRttMs) * leniency(km));
}

/** `[r,g,b]` → `#rrggbb`. */
export function hex(rgb: RGB): string {
  let s = '#';
  for (let i = 0; i < 3; i++) {
    const v = Math.max(0, Math.min(255, Math.round(rgb[i]!))).toString(16);
    s += (v.length < 2 ? '0' : '') + v;
  }
  return s;
}

/** `linear-gradient(...)` de la légende, normalisé sur la vitesse maximale. */
export function gradientCSS(): string {
  const max = SPEED_STOPS[SPEED_STOPS.length - 1]![0];
  const parts = SPEED_STOPS.map(([kmps, rgb]) => `${hex(rgb)} ${((100 * kmps) / max).toFixed(1)}%`);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
