/** Fait suivre la surface du globe aux câbles (interpolation grand cercle). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(process.cwd(), 'apps', 'web', 'src', 'Globe.tsx');
let src = readFileSync(FILE, 'utf8');

const old = `        if ((a[0] === 0 && a[1] === 0) || (b[0] === 0 && b[1] === 0)) continue;
        pushPoint(positions, a[0], a[1], R + 1);
        pushPoint(positions, b[0], b[1], R + 1);`;

const neu = `        if ((a[0] === 0 && a[1] === 0) || (b[0] === 0 && b[1] === 0)) continue;

        // Interpolation sur la sphere : sans ca, deux points eloignes sont
        // relies par une corde droite qui traverse l'ocean (rendu incoherent).
        const va = latLonToVec3(a[1]!, a[0]!, 1);
        const vb = latLonToVec3(b[1]!, b[0]!, 1);
        const omega = Math.acos(Math.min(1, Math.max(-1, va.dot(vb))));
        const steps = Math.max(1, Math.min(24, Math.ceil((omega / Math.PI) * 48)));
        const so = Math.sin(omega) || 1e-6;
        for (let s = 0; s < steps; s++) {
          for (const t of [s / steps, (s + 1) / steps]) {
            const k0 = Math.sin((1 - t) * omega) / so;
            const k1 = Math.sin(t * omega) / so;
            const x = va.x * k0 + vb.x * k1;
            const y = va.y * k0 + vb.y * k1;
            const z = va.z * k0 + vb.z * k1;
            const len = Math.hypot(x, y, z) || 1;
            const rr = R + 1;
            positions.push((x / len) * rr, (y / len) * rr, (z / len) * rr);
          }
        }`;

if (!src.includes(old)) {
  console.log('BLOC INTROUVABLE');
  process.exit(1);
}
src = src.replace(old, neu);
writeFileSync(FILE, src);
console.log('câbles : interpolation grand cercle appliquée');
