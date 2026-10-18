/**
 * Types partagés du projet GeoTrace (clone sans sondes de Geo Traceroute).
 * Aucune dépendance — ce paquet est la base de tous les autres.
 */

/** Format de sortie reconnu en entrée du mode « coller un traceroute ». */
export type TraceFormat = 'traceroute' | 'tracert' | 'mtr' | 'tracepath';

/** Un saut brut, tel qu'extrait du texte collé. */
export interface Hop {
  /** Numéro de saut (TTL). Peut ne pas être contigu si des sauts n'ont pas répondu. */
  ttl: number;
  /** IP du routeur, ou `null` si le saut n'a pas répondu. */
  ip: string | null;
  /** Nom résolu affiché par l'outil (`PTR`), si présent. */
  host: string | null;
  /** Latences mesurées en ms (0 à 3 selon l'outil et les réponses). */
  rttMs: number[];
  /** `true` quand aucun des sondes n'a répondu (`* * *`). */
  timeout: boolean;
  /** `true` pour une IP privée/loopback/link-local (pas de géolocalisation possible). */
  private: boolean;
}

/** Résultat du parsing d'un traceroute collé. */
export interface ParsedTrace {
  format: TraceFormat;
  /** Hôte cible tel qu'écrit dans l'en-tête, sans le domaine de recherche. */
  target: string | null;
  /** IP cible résolue, si l'en-tête la fournit. */
  destIp: string | null;
  /** Nombre maximal de sauts demandé, si présent. */
  maxHops: number | null;
  hops: Hop[];
  /** Anomalies non bloquantes rencontrées pendant le parsing. */
  warnings: string[];
}

/** Un saut après enrichissement (rDNS / ASN / GeoIP) et géolocalisation. */
export interface ResolvedHop {
  ttl: number;
  ip: string;
  host: string | null;
  /** Latence retenue pour ce hop (ms) — la plus faible disponible. */
  rttMs: number;
  asn: number | null;
  asName: string | null;
  country: string | null;
  /** Code continent du pays (ex. `EU`), quand connu. */
  continent: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  /** Confiance de la géolocalisation, 0..1. */
  confidence: number;
  private: boolean;
  /** `true` si la position est une estimation (pas de signal fort). */
  estimated: boolean;
}

/** Groupe de sauts consécutifs situés dans la même ville (ligne du panneau). */
export interface CityGroup {
  i: number;
  country: string | null;
  continent: string | null;
  city: string;
  lat: number;
  lon: number;
  /** Latence affichée = minimum des latences du groupe. */
  rttMs: number;
  /** Distance (km) parcourue depuis la ville précédente — mode geek. */
  kmFromPrev: number;
  hops: ResolvedHop[];
  /**
   * Polyligne `[lat, lon]` du trajet le long des câbles qui mène �  cette ville
   * (mode Topo uniquement). Absente si le trajet suit un grand cercle.
   */
  polyline?: Array<[number, number]>;
}

/** Segment dessiné entre deux villes, longueur et delta de RTT. */
export interface Segment {
  fromIndex: number;
  toIndex: number;
  km: number;
  rttDeltaMs: number;
}

/** Résultat complet, prêt à être rendu par l'interface. */
export interface TraceResult {
  target: string;
  destIp: string | null;
  /** `true` si l'IP de destination est annoncée en anycast. */
  anycast: boolean;
  asPath: number[];
  /** Distance totale (km) : le long des câbles (Topo) ou des grands cercles (Ligne). */
  distanceKm: number;
  /** Vitesse implicite (km/s) = 2000 × distanceKm / RTT du dernier hop qui répond. */
  speedKmS: number;
  segments: Segment[];
  groups: CityGroup[];
  /** Confiance moyenne des sauts effectivement localis�s (0..1). */
  confidence: number;
  /** Proportion de sauts publics localis�s (0..1). */
  coverage: number;
}

/** Fournisseur de tracés physiques (câbles sous-marins). */
export interface CableRoute {
  /** Points `[lat, lon]` de la polyligne. */
  polyline: Array<[number, number]>;
}
