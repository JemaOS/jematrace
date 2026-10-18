/** Photon non rogné + zones de survol larges sur les câbles 2D. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'apps', 'web', 'src');

/* ------------------------------------------------------------------ Globe */
const GLOBE = join(SRC, 'Globe.tsx');
let g = readFileSync(GLOBE, 'utf8');
let gHits = 0;

const photonOld = `      <mesh>
        <sphereGeometry args={[2.2, 14, 14]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <sprite scale={[16, 16, 1]}>
        <spriteMaterial
          map={glowTexture()}
          color="#b9ffd6"
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>`;

const photonNew = `      {/* depthTest desactive : sinon la sphere du globe coupe le halo. */}
      <mesh renderOrder={12}>
        <sphereGeometry args={[2.2, 14, 14]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} depthTest={false} />
      </mesh>
      <sprite scale={[18, 18, 1]} renderOrder={11}>
        <spriteMaterial
          map={glowTexture()}
          color="#b9ffd6"
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </sprite>`;

if (g.includes(photonOld)) {
  g = g.replace(photonOld, photonNew);
  gHits += 1;
} else {
  console.log('MISS photon');
}
writeFileSync(GLOBE, g);

/* ------------------------------------------------------------------- Map2D */
const MAP = join(SRC, 'Map2D.tsx');
let m = readFileSync(MAP, 'utf8');
let mHits = 0;

const cableOld = `              L.polyline(
                segment.map(([lon, lat]) => [lat, lon] as [number, number]),
                { color: '#2f7fd0', weight: 1.2, opacity: 0.55, pane: 'cablePane' },
              )
                .bindTooltip(cable.name, { className: 'cable-tooltip', sticky: true })
                .addTo(group);`;

const cableNew = `              const path = segment.map(([lon, lat]) => [lat, lon] as [number, number]);
              // Trait visible, non interactif.
              L.polyline(path, {
                color: '#2f7fd0',
                weight: 1.2,
                opacity: 0.55,
                pane: 'cablePane',
                interactive: false,
              }).addTo(group);
              // Zone de survol large et invisible : le nom du cable devient facile a lire.
              L.polyline(path, {
                color: '#000000',
                weight: 14,
                opacity: 0,
                pane: 'cablePane',
                interactive: true,
              })
                .bindTooltip(cable.name, { className: 'cable-tooltip', sticky: true })
                .addTo(group);`;

if (m.includes(cableOld)) {
  m = m.replace(cableOld, cableNew);
  mHits += 1;
} else {
  console.log('MISS cables');
}
writeFileSync(MAP, m);

console.log(`Globe: ${gHits}/1, Map2D: ${mHits}/1`);
