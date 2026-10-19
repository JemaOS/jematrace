/**
 * Préférences utilisateur, stockées en cookies avec le même préfixe que le site
 * de référence (`gt2_`), donc mêmes noms et mêmes valeurs.
 */

export type ViewMode = '3d' | '2d';
export type RouteMode = 'topo' | 'line';
export type Theme = 'dark' | 'light';

export interface Prefs {
  /** Vue par défaut. Cookie `gt2_view` : `3d` | `2d`. */
  view: ViewMode;
  /** Routage. Cookie `gt2_route` : `topo` | `line`. */
  route: RouteMode;
  /** Apparence du globe. Cookie `gt2_look`. */
  look: string;
  /** Afficher les câbles sous-marins. Cookie `gt2_cables`. */
  cables: boolean;
  /** Afficher les villes. Cookie `gt2_cities`. */
  cities: boolean;
  /** Mode geek. Cookie `gt2_geek`. */
  geek: boolean;
  /** Thème de l'interface. Cookie `gt2_theme` : `dark` | `light`. */
  theme: Theme;
}

export const DEFAULT_PREFS: Prefs = {
  view: '3d',
  route: 'topo',
  look: 'vector',
  cables: true,
  // Les villes sont masquées au premier lancement : le globe reste lisible,
  // l'utilisateur les active s'il le souhaite.
  cities: false,
  geek: false,
  theme: 'dark',
};

const PREFIX = 'gt2_';

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`;
}

/** Lit les préférences depuis les cookies, en retombant sur les valeurs par défaut. */
export function readPrefs(): Prefs {
  return {
    view: readCookie(`${PREFIX}view`) === '2d' ? '2d' : '3d',
    route: readCookie(`${PREFIX}route`) === 'line' ? 'line' : 'topo',
    look: readCookie(`${PREFIX}look`) ?? DEFAULT_PREFS.look,
    cables: readCookie(`${PREFIX}cables`) !== '0',
    cities: readCookie(`${PREFIX}cities`) === '1',
    geek: readCookie(`${PREFIX}geek`) === '1',
    theme: readCookie(`${PREFIX}theme`) === 'light' ? 'light' : 'dark',
  };
}

/** Écrit les préférences, comme le site : tout d'un bloc au moment d'Enregistrer. */
export function writePrefs(p: Prefs): void {
  writeCookie(`${PREFIX}view`, p.view);
  writeCookie(`${PREFIX}route`, p.route);
  writeCookie(`${PREFIX}look`, p.look);
  writeCookie(`${PREFIX}cables`, p.cables ? '1' : '0');
  writeCookie(`${PREFIX}cities`, p.cities ? '1' : '0');
  writeCookie(`${PREFIX}geek`, p.geek ? '1' : '0');
  writeCookie(`${PREFIX}theme`, p.theme);
}
