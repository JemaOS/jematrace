/** Code pays ISO-3166 alpha-2 → drapeau emoji (aucun asset à charger). */
export function flagOf(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return '🏳️';
  const base = 0x1f1e6;
  const code = countryCode.toUpperCase();
  const first = code.charCodeAt(0) - 65;
  const second = code.charCodeAt(1) - 65;
  if (first < 0 || first > 25 || second < 0 || second > 25) return '🏳️';
  return String.fromCodePoint(base + first, base + second);
}

/** Sépare les milliers par une espace fine, comme le site de référence. */
export function groupNumber(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}
