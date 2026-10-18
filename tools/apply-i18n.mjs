/**
 * Applique l'i18n aux textes de l'interface (App.tsx, Panel.tsx).
 * Remplace les nœuds de texte isolés par {t('clé')} et quelques chaînes inline.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const APP = join(ROOT, 'apps', 'web', 'src', 'App.tsx');
const PANEL = join(ROOT, 'apps', 'web', 'src', 'Panel.tsx');

/** Lignes dont le contenu (trim) est exactement ce texte. */
const LINE_MAP = {
  'Préférences': 'nav.prefs',
  'Méthodologie': 'nav.method',
  'Crédits': 'nav.credits',
  'Contact': 'nav.contact',
  'Villes': 'ctrl.cities',
  'Câbles sous-marins': 'ctrl.cables',
  'lent': 'legend.slow',
  'moyen': 'legend.avg',
  'rapide': 'legend.fast',
  'Lancer un autre traceroute': 'panel.another',
  'Destination': 'panel.dest',
  'Sonde': 'panel.probe',
  'Traceroutes récents': 'panel.recent',
};

function applyLines(text) {
  let hits = 0;
  const lines = text.split('\n').map((line) => {
    const trimmed = line.trim();
    const key = LINE_MAP[trimmed];
    if (!key) return line;
    hits += 1;
    const indent = line.slice(0, line.length - line.trimStart().length);
    return `${indent}{t('${key}')}`;
  });
  return { text: lines.join('\n'), hits };
}

function applyInline(text, pairs) {
  let out = text;
  let hits = 0;
  for (const [from, to] of pairs) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
      hits += 1;
    }
  }
  return { text: out, hits };
}

/* ------------------------------------------------------------------ App.tsx */
let app = readFileSync(APP, 'utf8');
let total = 0;

const imports = applyInline(app, [
  ["import { detectClientIp, inspect, type InspectResponse } from './api';",
   "import { detectClientIp, inspect, type InspectResponse } from './api';\nimport { useT } from './i18n';"],
]);
app = imports.text; total += imports.hits;

const pasteHook = applyInline(app, [
  ["}) {\n  const [text, setText] = useState(initialText);",
   "}) {\n  const { t } = useT();\n  const [text, setText] = useState(initialText);"],
]);
app = pasteHook.text; total += pasteHook.hits;

const appHook = applyInline(app, [
  ["export default function App() {\n",
   "export default function App() {\n  const { t, lang, setLang } = useT();\n"],
]);
app = appHook.text; total += appHook.hits;

const pill = applyInline(app, [
  [`          <div className="lang-pill" title="Choisir la langue">
            FR<i className="caret" />
          </div>`,
   `          <button
            className="lang-pill"
            title="Choisir la langue / Choose language"
            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
          >
            {lang.toUpperCase()}
            <i className="caret" />
          </button>`],
]);
app = pill.text; total += pill.hits;

const appInline = applyInline(app, [
  ["Collez votre propre <span>traceroute</span>", "{t('paste.title')}<span>{t('paste.titleAccent')}</span>"],
  ["Pris en charge :", "{t('paste.supported')}"],
  ["— ou collez avec", "{t('paste.orPaste')}"],
  ["n'importe où sur la page.", "{t('paste.anywhere')}"],
  ["{busy ? 'Analyse…' : 'Visualiser !'}", "{busy ? t('paste.analyzing') : t('paste.visualize')}"],
  ["{copied ? 'Commande copiée ✓' : 'Copier la commande'}", "{copied ? t('paste.copied') : t('paste.copyCommand')}"],
  ["Sur votre machine :", "{t('paste.onYourMachine')}"],
  ["Échelle de latence", "{t('legend.title')}"],
  ["<label htmlFor=\"tr\">Sortie du traceroute</label>", "<label htmlFor=\"tr\">{t('paste.label')}</label>"],
]);
app = appInline.text; total += appInline.hits;

const appLines = applyLines(app);
app = appLines.text; total += appLines.hits;
writeFileSync(APP, app);

/* ---------------------------------------------------------------- Panel.tsx */
let panel = readFileSync(PANEL, 'utf8');
let panelTotal = 0;

const pImport = applyInline(panel, [
  ["import { groupNumber } from './format';", "import { groupNumber } from './format';\nimport { useT } from './i18n';"],
]);
panel = pImport.text; panelTotal += pImport.hits;

const pHook = applyInline(panel, [
  ["export function Panel({ result, hops, geek, onReset, onShare, onCollapse, recent, onPickRecent }: Props) {",
   "export function Panel({ result, hops, geek, onReset, onShare, onCollapse, recent, onPickRecent }: Props) {\n  const { t } = useT();"],
]);
panel = pHook.text; panelTotal += pHook.hits;

const pInline = applyInline(panel, [
  ['aria-label="Partager ce traceroute"', "aria-label={t('panel.share')}"],
  ["<b>IP :</b>", "<b>{t('panel.ip')}</b>"],
  ["<b>AS :</b>", "<b>{t('panel.as')}</b>"],
  ["<b>Chemin AS :</b>", "<b>{t('panel.asPath')}</b>"],
  ["<b>Distance :</b>", "<b>{t('panel.distance')}</b>"],
  ["<b>Confiance :</b>", "<b>{t('panel.confidence')}</b>"],
  ["Cliquez une ville pour voir ses sauts", "{t('panel.clickCity')}"],
  ["Détail affiché (mode geek)", "{t('panel.geekOn')}"],
]);
panel = pInline.text; panelTotal += pInline.hits;

const pLines = applyLines(panel);
panel = pLines.text; panelTotal += pLines.hits;
writeFileSync(PANEL, panel);

console.log(`App: ${total} remplacements, Panel: ${panelTotal}`);
