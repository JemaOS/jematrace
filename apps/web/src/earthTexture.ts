import * as THREE from 'three';

import type { Look } from './looks';
import type { WorldData } from './world';

/**
 * Largeur de texture adaptée à l'écran.
 *
 * Le globe affiché fait au plus quelques centaines de pixels : inutile de
 * générer 4096 × 2048 (32 Mo). Sur mobile, 1024 × 512 (2 Mo) suffit et évite
 * les échecs d'allocation mémoire qui laissaient un globe blanc.
 */
export function earthTextureWidth(): number {
  if (typeof window === 'undefined') return 1024;
  return window.innerWidth < 900 ? 1024 : 2048;
}

/**
 * Peint la texture équirectangulaire : uniquement le remplissage (océan et
 * terres). Les côtes et les frontières ne sont pas peintes ici : elles sont
 * tracées en géométrie 3D par `OutlineLayer`, pour rester nettes au zoom.
 */
export function paintEarth(world: WorldData, look: Look, width: number): HTMLCanvasElement {
  const W = width;
  const H = Math.round(width / 2);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

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

  ctx.fillStyle = look.land;
  for (const ring of world.land) {
    if (ring.length < 3) continue;
    path(ring);
    ctx.fill();
  }

  return canvas;
}

/**
 * Construit la texture du globe.
 *
 * On reste sur `CanvasTexture` : le passage par `ImageBitmap` produisait une
 * texture blanche sur certains navigateurs mobiles (le bitmap n'était pas
 * encore décodé au premier upload). Le canvas reste référencé par la texture,
 * donc il n'est pas collecté.
 *
 * Les mipmaps sont désactivées : inutiles sur une sphère, et elles coûtent
 * ~30 % de mémoire et de temps d'upload.
 */
export function buildEarthTexture(
  world: WorldData,
  look: Look,
  width = earthTextureWidth(),
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(paintEarth(world, look, width));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}