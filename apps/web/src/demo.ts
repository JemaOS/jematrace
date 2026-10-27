/**
 * Trace affichée à l'ouverture, pour que la page d'accueil montre tout de
 * suite un résultat plutôt qu'un écran vide.
 *
 * La trace est **entièrement synthétique** : elle ne contient aucune IP ni
 * aucune donnée issue d'une mesure réelle. Les sauts pointent vers des
 * infrastructures publiques génériques (GTT/Paris, DE-CIX/Cologne, LINX/
 * Londres, RIPE/Amsterdam) et la cible est un domaine de documentation
 * réservé (`example.org`).
 *
 * L'ancre est un point fixe (Paris) : aucune IP de visiteur n'est envoyée ni
 * affichée, la démonstration est identique pour tout le monde.
 */
export const DEMO_TRACE = `Détermination de l’itinéraire vers www.example.org [193.0.0.1]
avec un maximum de 30 sauts :

  1     4 ms     4 ms     5 ms  213.200.64.1
  2     9 ms     8 ms     9 ms  80.81.192.1
  3    14 ms    13 ms    14 ms  195.66.224.1
  4     *        *        *     Délai d’attente de la demande dépassé.
  5    21 ms    20 ms    21 ms  193.0.0.1
`;

/** Cible de la démonstration, lue dans l'en-tête de la trace. */
export const DEMO_TARGET = 'www.example.org';

/** Point de départ du trace de démonstration (Paris), sans aucune IP. */
export const DEMO_ANCHOR = { lat: 48.8566, lon: 2.3522 };
