/** Ajoute la position du visiteur comme point #0 (panneau + globe + carte). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'apps', 'web', 'src');
const APP = join(SRC, 'App.tsx');
const PANEL = join(SRC, 'Panel.tsx');
const CSS = join(SRC, 'styles.css');

/* ------------------------------------------------------------------ Panel */
let panel = readFileSync(PANEL, 'utf8');
let pHits = 0;

const panelEdits = [
  [
    "import type { InspectHop } from './api';",
    "import type { ClientPosition, InspectHop } from './api';",
  ],
  [
    '  recent: RecentEntry[];',
    '  recent: RecentEntry[];\n  /** Position de depart du visiteur, affichee en #0. */\n  client?: ClientPosition | null;',
  ],
  [
    'export function Panel({ result, hops, geek, onReset, onShare, onCollapse, recent, onPickRecent }: Props) {',
    'export function Panel({ result, hops, geek, onReset, onShare, onCollapse, recent, onPickRecent, client }: Props) {',
  ],
  [
    '      <div className="groups">',
    `      {client && (
        <div className="client-row">
          <span className="idx">#0</span>
          <span className="dot" />
          <span className="city">{client.city ?? 'Votre position'}</span>
          <span className="ms">0 ms</span>
          <span className="client-ip">{client.ip}</span>
        </div>
      )}

      <div className="groups">`,
  ],
];
for (const [from, to] of panelEdits) {
  if (panel.includes(from)) {
    panel = panel.replace(from, to);
    pHits += 1;
  }
}
writeFileSync(PANEL, panel);

/* -------------------------------------------------------------------- App */
let app = readFileSync(APP, 'utf8');
let aHits = 0;

const appEdits = [
  [
    '  }, [data]);\n\n  /**\n   * Représentants pour la carte 2D',
    `  }, [data]);

  /** Point de depart : l'IP publique du visiteur, placee en #0. */
  const clientHop = useMemo<InspectHop | null>(() => {
    const c = data?.client;
    if (!c) return null;
    return {
      ttl: 0,
      ip: c.ip,
      host: null,
      rttMs: 0,
      asn: null,
      asName: null,
      country: null,
      continent: null,
      city: c.city,
      lat: c.lat,
      lon: c.lon,
      confidence: 1,
      private: false,
      estimated: false,
      color: '#3ce0ff',
      timeout: false,
    };
  }, [data]);

  const mapHopsWithClient = useMemo(
    () => (clientHop ? [clientHop, ...mapHops] : mapHops),
    [clientHop, mapHops],
  );

  const globeHops = useMemo(
    () => (clientHop ? [clientHop, ...data.hops] : (data?.hops ?? [])),
    [clientHop, data],
  );

  /**
   * Représentants pour la carte 2D`,
  ],
  ['<Map2D hops={mapHops}', '<Map2D hops={mapHopsWithClient}'],
  ['<Globe hops={data.hops}', '<Globe hops={globeHops}'],
  [
    'geek={prefs.geek}',
    'geek={prefs.geek}\n          client={data.client}',
  ],
];
for (const [from, to] of appEdits) {
  if (app.includes(from)) {
    app = app.replace(from, to);
    aHits += 1;
  }
}
writeFileSync(APP, app);

/* -------------------------------------------------------------------- CSS */
const css = `

/* Point de depart du visiteur (#0). */
.client-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 6px;
  background: #0f1a2a;
  border: 1px solid #1c2f47;
  font-size: 14px;
}

.client-row .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3ce0ff;
  box-shadow: 0 0 8px #3ce0ff;
  flex: 0 0 auto;
}

.client-row .city {
  flex: 1;
}

.client-row .ms {
  color: var(--muted);
  font-family: Consolas, monospace;
  font-size: 13px;
}

.client-row .client-ip {
  width: 100%;
  padding-left: 34px;
  color: var(--muted);
  font-family: Consolas, monospace;
  font-size: 11px;
}
`;
writeFileSync(CSS, readFileSync(CSS, 'utf8') + css);

console.log(`Panel: ${pHits}/4, App: ${aHits}/5`);
