import * as THREE from 'three';

import type { Look } from './looks';
import type { WorldData } from './world';

/**
 * Texture équirectangulaire du globe : uniquement le remplissage (océan et
 * terres). Les côtes et les frontières ne sont pas peintes ici : elles sont
 * tracées en géométrie 3D par `OutlineLayer`, pour rester nettes au zoom.
 *
 * 4096 × 2048 : au zoom maximal, la texture est agrandie ~1,5× ; en 2048 elle
 * devenait visiblement floue.
 */
export function buildEarthTexture(world: WorldData, look: Look): THREE.CanvasTexture {
  // 4096 × 2048 : au zoom maximal du globe 3D, la texture est agrandie ~1,5×,
  // donc 2048 devenait flou. 32 Mo de VRAM sont acceptables.
  const W = 4096;
  const H = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = look.ocean;
  ctx.fillRect(0, 0, W, H);

  const X = (lon: number) => ((lon + 180) / 360) * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;
  ctx.lineJoin = 'round';

  const path = (ring: number[][]) => {
    ctx.beginPath();
    ring.forEach(([lon, lat], i) => {
      if (i === 0) ctx.moveTo(X(lon!), Y(lat!));
      else ctx.lineTo(X(lon!), Y(lat!));
    });
    ctx.closePath();
  };

  // Remplissage seul : les traits (côtes, frontières) sont tracés en 3D par
  // `OutlineLayer`, sinon ils sont peints dans la texture et deviennent flous
  // dès qu'on zoome sur le globe.
  ctx.fillStyle = look.land;
  for (const ring of world.land) {
    if (ring.length < 3) continue;
    path(ring);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // 8× coûte cher en remplissage sur un GPU intégré ; 4× suffit.
  texture.anisotropy = 4;
  return texture;
}
