/**
 * Trace affichée à l'ouverture, pour que la page d'accueil montre tout de
 * suite un résultat plutôt qu'un écran vide.
 *
 * L'ancre est un point fixe (Cannes) : aucune IP de visiteur n'est envoyée ni
 * affichée, la démonstration est identique pour tout le monde.
 */
export const DEMO_TRACE = `Détermination de l’itinéraire vers drop.jemaos.com [62.210.39.166]
avec un maximum de 30 sauts :

  1     4 ms     4 ms     7 ms  192.168.1.1
  2     7 ms     5 ms     6 ms  80.15.224.25
  3    25 ms     6 ms     6 ms  92.184.150.30
  4     7 ms     8 ms     7 ms  ae43-0.nimar202.rbci.orange.net [193.252.103.241]
  5    17 ms    17 ms    17 ms  193.252.137.54
  6    18 ms    18 ms    18 ms  193.251.131.111
  7    18 ms    18 ms    20 ms  193.251.152.48
  8    18 ms    18 ms    18 ms  212.47.224.7
  9    29 ms    20 ms    17 ms  51.158.0.151
 10     *        *        *     Délai d’attente de la demande dépassé.
 11     *        *        *     Délai d’attente de la demande dépassé.
 12    18 ms    18 ms    18 ms  62.210.39.166
`;

/** Cible de la démonstration, lue dans l'en-tête de la trace. */
export const DEMO_TARGET = 'drop.jemaos.com';

/** Point de départ du trace de démonstration (Cannes), sans aucune IP. */
export const DEMO_ANCHOR = { lat: 43.5513, lon: 7.0128 };
