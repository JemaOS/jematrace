import { createContext, useContext } from 'react';

export type Lang = 'fr' | 'en';

/**
 * Chaînes de l'interface. Les clés couvrent la navigation, la vue « coller »,
 * les contrôles et le panneau. Le dictionnaire est volontairement plat pour
 * rester simple à étendre aux autres langues.
 */
const fr = {
  'nav.prefs': 'Préférences',
  'nav.method': 'Méthodologie',
  'nav.credits': 'À propos',
  'nav.contact': 'Contact',

  'paste.title': 'Collez votre propre ',
  'paste.titleAccent': 'traceroute',
  'paste.desc1': 'Copiez la sortie de ',
  'paste.desc2': ' ou ',
  'paste.desc3': ' et collez-la ci-dessous.',
  'paste.label': 'Sortie du traceroute',
  'paste.supported': 'Pris en charge :',
  'paste.orPaste': ' — ou collez avec ',
  'paste.anywhere': " n'importe où sur la page.",
  'paste.visualize': 'Visualiser !',
  'paste.analyzing': 'Analyse…',
  'load.title': 'Analyse de votre trace',
  'load.toward': 'Analyse de la trace vers {target}',
  'load.from': 'depuis {source}',
  'load.fromYou': 'depuis votre connexion',
  'load.origin': 'Source : votre machine (la trace vient de votre traceroute)',
  'load.takesTime': 'Cela peut prendre un moment…',
  'load.step1': 'Lecture de la trace',
  'load.step2': 'Résolution des noms (DNS inverse)',
  'load.step3': 'Géolocalisation des sauts',
  'load.step4': 'Calcul des distances et des vitesses',
  'paste.noHops': "Aucun saut reconnu : collez la sortie complète de tracert, traceroute, mtr ou tracepath.",
  'paste.copyCommand': 'Copier la commande',
  'paste.copied': 'Commande copiée ✓',
  'paste.fromClipboard': 'Depuis le presse-papiers',
  'paste.os': 'Votre système :',
  'paste.onYourMachine': 'Sur votre machine :',
  'paste.help.windows': 'touche Windows, tapez « cmd », Entrée, puis collez :',
  'paste.help.linux': 'ouvrez un terminal (Ctrl+Alt+T), puis collez :',
  'paste.help.macos': 'ouvrez le Terminal (⌘+Espace, tapez « Terminal »), puis collez :',
  'paste.help.jemaos': 'ouvrez le shell (Ctrl+Alt+T), puis collez :',
  'paste.placeholder': 'traceroute to google.com (142.250.74.110), 30 hops max\n 1  192.168.1.1 (192.168.1.1)  1.234 ms\n 2  * * *\n 3  203.0.113.1 (203.0.113.1)  8.456 ms\n ...',

  'panel.another': 'Lancer sa traceroute',
  'panel.recent': 'Traceroutes récents',

  'panel.ip': 'IP :',
  'panel.as': 'AS :',
  'panel.asPath': 'Chemin AS :',
  'panel.distance': 'Distance :',
  'panel.noDistance': 'Distance non calculable : aucun saut géolocalisable (cette trace ne donne que des noms, ou la latence contredit la position).',
  'panel.noCable': 'Aucun câble sous-marin sur ces liaisons : les modes Topo et Ligne donnent le même tracé.',
  'panel.clickCity': 'Cliquez une ville pour voir ses sauts',
  'panel.geekOn': 'Détail affiché (mode geek)',
  'panel.share': 'Partager ce traceroute',

  'ctrl.cities': 'Villes',
  'ctrl.cables': 'Câbles sous-marins',
  'ctrl.look': 'Apparence du globe',

  'legend.title': 'Échelle de latence',
  'legend.slow': 'lent',
  'legend.avg': 'moyen',
  'legend.fast': 'rapide',

  'prefs.title': 'Préférences',
  'prefs.look': 'Apparence du globe',
  'prefs.view2d': 'Vue 2D par défaut',
  'prefs.route': 'Routage par câbles sous-marins',
  'prefs.cables': 'Afficher les câbles sous-marins',
  'prefs.cities': 'Afficher les villes',
  'prefs.geek': 'Mode geek',
  'prefs.save': 'Enregistrer',
  'prefs.saved': 'Les réglages sont enregistrés dans votre navigateur.',

  'common.loading': 'Chargement du globe…',
} as const;

const en: Record<keyof typeof fr, string> = {
  'nav.prefs': 'Preferences',
  'nav.method': 'Methodology',
  'nav.credits': 'About',
  'nav.contact': 'Contact',

  'paste.title': 'Paste your own ',
  'paste.titleAccent': 'traceroute',
  'paste.desc1': 'Copy the output of ',
  'paste.desc2': ' or ',
  'paste.desc3': ' and paste it below.',
  'paste.label': 'Traceroute output',
  'paste.supported': 'Supported:',
  'paste.orPaste': ' — or paste with ',
  'paste.anywhere': ' anywhere on the page.',
  'paste.visualize': 'Visualize!',
  'paste.analyzing': 'Analyzing…',
  'load.title': 'Analyzing your trace',
  'load.toward': 'Analyzing the trace to {target}',
  'load.from': 'from {source}',
  'load.fromYou': 'from your connection',
  'load.origin': 'Source: your machine (the trace comes from your traceroute)',
  'load.takesTime': 'This may take a moment…',
  'load.step1': 'Reading the trace',
  'load.step2': 'Resolving names (reverse DNS)',
  'load.step3': 'Geolocating hops',
  'load.step4': 'Computing distances and speeds',
  'paste.noHops': 'No hop recognized: paste the full output of tracert, traceroute, mtr or tracepath.',
  'paste.copyCommand': 'Copy the command',
  'paste.copied': 'Command copied ✓',
  'paste.fromClipboard': 'From clipboard',
  'paste.os': 'Your system:',
  'paste.onYourMachine': 'On your machine:',
  'paste.help.windows': 'Windows key, type “cmd”, Enter, then paste:',
  'paste.help.linux': 'open a terminal (Ctrl+Alt+T), then paste:',
  'paste.help.macos': 'open Terminal (⌘+Space, type “Terminal”), then paste:',
  'paste.help.jemaos': 'open the shell (Ctrl+Alt+T), then paste:',
  'paste.placeholder': 'traceroute to google.com (142.250.74.110), 30 hops max\n 1  192.168.1.1 (192.168.1.1)  1.234 ms\n 2  * * *\n 3  203.0.113.1 (203.0.113.1)  8.456 ms\n ...',

  'panel.another': 'Run your own traceroute',
  'panel.recent': 'Recent traceroutes',

  'panel.ip': 'IP:',
  'panel.as': 'AS:',
  'panel.asPath': 'AS path:',
  'panel.distance': 'Distance:',
'panel.noDistance': 'Distance unavailable: no geolocatable hop (this trace only gives names, or latency contradicts the location).',
  'panel.noCable': 'No submarine cable on these links: Topo and Ligne give the same path.',
  'panel.clickCity': 'Click a city to see its hops',
  'panel.geekOn': 'Details shown (geek mode)',
  'panel.share': 'Share this traceroute',

  'ctrl.cities': 'Cities',
  'ctrl.cables': 'Submarine cables',
  'ctrl.look': 'Globe appearance',

  'legend.title': 'Latency scale',
  'legend.slow': 'slow',
  'legend.avg': 'average',
  'legend.fast': 'fast',

  'prefs.title': 'Preferences',
  'prefs.look': 'Globe appearance',
  'prefs.view2d': '2D view by default',
  'prefs.route': 'Submarine cable routing',
  'prefs.cables': 'Show submarine cables',
  'prefs.cities': 'Show cities',
  'prefs.geek': 'Geek mode',
  'prefs.save': 'Save',
  'prefs.saved': 'Settings are stored in your browser.',

  'common.loading': 'Loading the globe…',
};

export type TKey = keyof typeof fr;

export interface Translator {
  lang: Lang;
  t: (key: TKey) => string;
  setLang: (lang: Lang) => void;
}

export const LangContext = createContext<Translator>({
  lang: 'fr',
  t: (key) => fr[key],
  setLang: () => {},
});

export function useT(): Translator {
  return useContext(LangContext);
}

export const STRINGS: Record<Lang, Record<TKey, string>> = { fr, en };
