/** Nœuds du globe cliquables + infobulle (n°, drapeau, ville, pays, RTT). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'apps', 'web', 'src');
const GLOBE = join(SRC, 'Globe.tsx');
const CSS = join(SRC, 'styles.css');

let g = readFileSync(GLOBE, 'utf8');
let hits = 0;
const edits = [
  // markers : garder le hop complet
  [
    `        position: latLonToVec3(h.lat!, h.lon!, R + SURF_OFFSET + 1).toArray() as [number, number, number],
        color: i === 0 ? '#3ce0ff' : i === located.length - 1 ? '#ff9e2c' : h.color,
      })),`,
    `        position: latLonToVec3(h.lat!, h.lon!, R + SURF_OFFSET + 1).toArray() as [number, number, number],
        color: i === 0 ? '#3ce0ff' : i === located.length - 1 ? '#ff9e2c' : h.color,
        hop: h,
      })),`,
  ],
  // Scene : prop onHover
  [
    'function Scene({ hops, look, showCities, showCables, world, limit, active }: GlobeProps & { world: WorldData | null }) {',
    'function Scene({ hops, look, showCities, showCables, world, limit, active, onHover }: GlobeProps & { world: WorldData | null; onHover?: (hop: InspectHop | null) => void }) {',
  ],
  // Node : props + handlers
  [
    'function Node({ position, color, active }: { position: [number, number, number]; color: string; active: boolean }) {',
    'function Node({ position, color, active, hop, onHover }: { position: [number, number, number]; color: string; active: boolean; hop?: InspectHop; onHover?: (hop: InspectHop | null) => void }) {',
  ],
  [
    '    <group position={position}>',
    `    <group
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (hop) onHover?.(hop);
      }}
      onPointerOut={() => onHover?.(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (hop) onHover?.(hop);
      }}
    >`,
  ],
  // rendu du Node avec les nouvelles props
  [
    '<Node key={m.key} position={m.position} color={m.color} active={active === i} />',
    '<Node key={m.key} position={m.position} color={m.color} active={active === i} hop={m.hop} onHover={onHover} />',
  ],
];
for (const [from, to] of edits) {
  if (g.includes(from)) {
    g = g.replace(from, to);
    hits += 1;
  } else {
    console.log('MISS:', from.slice(0, 60).replace(/\n/g, ' | '));
  }
}

// Globe : état + infobulle
const oldRender = `export function Globe(props: GlobeProps) {
  const [world, setWorld] = useState<WorldData | null>(null);`;
const newRender = `export function Globe(props: GlobeProps) {
  const [world, setWorld] = useState<WorldData | null>(null);
  const [hover, setHover] = useState<InspectHop | null>(null);`;
if (g.includes(oldRender)) {
  g = g.replace(oldRender, newRender);
  hits += 1;
}

const oldCanvas = `<Scene {...props} world={world} />`;
const newCanvas = `<Scene {...props} world={world} onHover={setHover} />`;
if (g.includes(oldCanvas)) {
  g = g.replace(oldCanvas, newCanvas);
  hits += 1;
}

const oldClose = `      <EffectComposer>
        <AdaptiveBloom />
      </EffectComposer>
    </Canvas>`;
const newClose = `      <EffectComposer>
        <AdaptiveBloom />
      </EffectComposer>
    </Canvas>

    {hover && (
      <div className="globe-tip">
        <span className="num">#{hover.ttl}</span>
        <img src={\`/flags/\${(hover.country ?? 'xx').toLowerCase()}.svg\`} alt="" />
        <strong>{hover.city ?? '—'}</strong>
        <span className="cc">({hover.country ?? '—'})</span>
        <span className="ms">{hover.rttMs} ms</span>
      </div>
    )}`;
if (g.includes(oldClose)) {
  g = g.replace(oldClose, newClose);
  hits += 1;
}

writeFileSync(GLOBE, g);

const css = `

/* Infobulle des noeuds du globe. */
.globe-tip {
  position: absolute;
  top: 104px;
  right: 16px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(13, 17, 23, 0.94);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  pointer-events: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
}

.globe-tip .num {
  color: #79c0ff;
  font-family: Consolas, monospace;
  font-weight: 700;
}

.globe-tip img {
  width: 18px;
  height: 13px;
  border-radius: 2px;
}

.globe-tip .cc {
  color: var(--muted);
}

.globe-tip .ms {
  color: #3fb950;
  font-family: Consolas, monospace;
}
`;
writeFileSync(CSS, readFileSync(CSS, 'utf8') + css);

console.log(`Globe: ${hits}/7`);
