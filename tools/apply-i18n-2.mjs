/** Termine l'i18n : description, légende, récents et libellés des préférences. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'apps', 'web', 'src');
const APP = join(SRC, 'App.tsx');
const PANEL = join(SRC, 'Panel.tsx');
const I18N = join(SRC, 'i18n.ts');

/* 1. Nouvelles clés de préférences */
let i18n = readFileSync(I18N, 'utf8');
const addFr = `  'prefs.look': 'Apparence du globe',
  'prefs.view2d': 'Vue 2D par défaut',
  'prefs.route': 'Routage par câbles sous-marins',
  'prefs.cables': 'Afficher les câbles sous-marins',
  'prefs.cities': 'Afficher les villes',
  'prefs.geek': 'Mode geek',
`;
const addEn = `  'prefs.look': 'Globe appearance',
  'prefs.view2d': '2D view by default',
  'prefs.route': 'Submarine cable routing',
  'prefs.cables': 'Show submarine cables',
  'prefs.cities': 'Show cities',
  'prefs.geek': 'Geek mode',
`;
i18n = i18n.replace("  'prefs.title': 'Préférences',\n", `  'prefs.title': 'Préférences',\n${addFr}`);
i18n = i18n.replace("  'prefs.title': 'Preferences',\n", `  'prefs.title': 'Preferences',\n${addEn}`);
writeFileSync(I18N, i18n);

/* 2. Remplacements par ligne exacte */
function patchByKey(file, key, value) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let hits = 0;
  const out = lines.map((line) => {
    if (line.trim() === key) {
      hits += 1;
      const indent = line.slice(0, line.length - line.trimStart().length);
      return indent + value;
    }
    return line;
  });
  writeFileSync(file, out.join('\n'));
  return hits;
}

let total = 0;
total += patchByKey(APP, 'Copiez la sortie de <code>traceroute</code>, <code>tracert</code> ou <code>mtr</code> et',
  "{t('paste.desc1')}<code>traceroute</code>, <code>tracert</code>{t('paste.desc2')}<code>mtr</code>{t('paste.desc3')}");
total += patchByKey(APP, 'collez-la ci-dessous.', '');
total += patchByKey(APP, '<span>lent</span>', "{t('legend.slow')}");
total += patchByKey(APP, '<span>moyen</span>', "{t('legend.avg')}");
total += patchByKey(APP, '<span>rapide</span>', "{t('legend.fast')}");
total += patchByKey(APP, '<b>Apparence du globe</b>', "<b>{t('prefs.look')}</b>");
total += patchByKey(APP, '<b>Vue 2D par défaut</b>', "<b>{t('prefs.view2d')}</b>");
total += patchByKey(APP, '<b>Routage par câbles sous-marins</b>', "<b>{t('prefs.route')}</b>");
total += patchByKey(APP, '<b>Afficher les câbles sous-marins</b>', "<b>{t('prefs.cables')}</b>");
total += patchByKey(APP, '<b>Afficher les villes</b>', "<b>{t('prefs.cities')}</b>");
total += patchByKey(APP, '<b>Mode geek</b>', "<b>{t('prefs.geek')}</b>");

total += patchByKey(PANEL, '<div className="recent-title">Traceroutes récents</div>', "<div className=\"recent-title\">{t('panel.recent')}</div>");
total += patchByKey(PANEL, '<span>Destination</span>', "<span>{t('panel.dest')}</span>");
total += patchByKey(PANEL, '<span>Sonde</span>', "<span>{t('panel.probe')}</span>");

console.log(`${total} remplacements`);
