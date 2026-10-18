import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { InspectHop } from './api';
import { buildEarthTexture } from './earthTexture';
import type { Look } from './looks';
import { loadCables, loadCities, loadWorld, type CableWorld, type CityPoint, type WorldData } from './world';

/** Rayon du globe, comme l'original. */
const R = 200;
const SURF_OFFSET = 2.2;
const TILT = 0.6;
const DEG = Math.PI / 180;

const COL_RIM = new THREE.Color(0x3f8fdd);

/** Petit disque lumineux (d�grad� radial) : les Points ne sont plus des carr�s. */
let glowTex: THREE.CanvasTexture | null = null;
let dotTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTex = new THREE.CanvasTexture(canvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

function latLonToVec3(lat: number, lon: number, r = R): THREE.Vector3 {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function pushPoint(out: number[], lon: number, lat: number, radius: number): void {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  out.push(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

const RIM_VERT = `
  varying vec3 vNormalW; varying vec3 vViewDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const RIM_FRAG = `
  uniform vec3 uRim; uniform float uRimPow; uniform float uRimMul;
  varying vec3 vNormalW; varying vec3 vViewDir;
  void main() {
    float fres = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewDir)), 0.0), uRimPow);
    gl_FragColor = vec4(uRim * fres * uRimMul, 1.0);
  }
`;
const ATMO_VERT = `
  varying vec3 vNormal;
  void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const ATMO_FRAG = `
  uniform vec3 uGlow; uniform float uIntensity; uniform float uOffset; uniform float uPow;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(max(0.0, uOffset - dot(vNormal, vec3(0.0, 0.0, 1.0))), uPow);
    gl_FragColor = vec4(uGlow, 1.0) * clamp(intensity, 0.0, 1.0) * uIntensity;
  }
`;

function Earth({ world, look }: { world: WorldData | null; look: Look }) {
  const texture = useMemo(() => (world ? buildEarthTexture(world, look) : null), [world, look]);
  useEffect(() => () => texture?.dispose(), [texture]);

  const rimUniforms = useMemo(
    () => ({ uRim: { value: COL_RIM.clone() }, uRimPow: { value: 4.5 }, uRimMul: { value: 0.7 } }),
    [],
  );
  const atmoUniforms = useMemo(
    () => ({ uGlow: { value: COL_RIM.clone() }, uIntensity: { value: 0.55 }, uOffset: { value: 0.48 }, uPow: { value: 6.0 } }),
    [],
  );

  return (
    <>
      {/* 96 × 64 suffit : le disque fait ~200 unités, l'erreur de corde est
          invisible. L'ancienne maille 160 × 120 coûtait 3× plus de sommets. */}
      <mesh>
        <sphereGeometry args={[R, 128, 96]} />
        {texture ? <meshBasicMaterial map={texture} toneMapped={false} /> : <meshBasicMaterial color={look.ocean} toneMapped={false} />}
      </mesh>
      {/* Côtes nettes (trait clair) et frontières (trait sombre), en 3D. */}
      <OutlineLayer world={world} rings="land" color={0x8fd8ff} opacity={0.5} radius={R + 0.4} />
      {look.borders && (
        <OutlineLayer world={world} rings="countries" color={0x5f9fd0} opacity={0.45} radius={R + 0.6} />
      )}
      <mesh scale={1.003}>
        <sphereGeometry args={[R, 128, 96]} />
        <shaderMaterial uniforms={rimUniforms} vertexShader={RIM_VERT} fragmentShader={RIM_FRAG} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh scale={1.18}>
        <sphereGeometry args={[R, 64, 48]} />
        <shaderMaterial uniforms={atmoUniforms} vertexShader={ATMO_VERT} fragmentShader={ATMO_FRAG} side={THREE.BackSide} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
      </mesh>
    </>
  );
}

/**
 * Côtes et frontières en géométrie 3D : traits d'un pixel, nets à toute
 * distance. Peints dans la texture, ils devenaient flous dès qu'on zoomait.
 */
function OutlineLayer({
  world,
  rings,
  color,
  opacity,
  radius,
}: {
  world: WorldData | null;
  rings: 'land' | 'countries';
  color: number;
  opacity: number;
  radius: number;
}) {
  const geometry = useMemo(() => {
    if (!world) return null;
    const positions: number[] = [];
    for (const ring of world[rings]) {
      if (ring.length < 2) continue;
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i]!;
        const b = ring[i + 1]!;
        if (a.length < 2 || b.length < 2) continue;
        pushPoint(positions, a[0]!, a[1]!, radius);
        pushPoint(positions, b[0]!, b[1]!, radius);
      }
    }
    if (positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [world, rings, radius]);

  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

/** Villes : tailles par rang de population (9 → 3), comme l'original. */
function CityDots({ count }: { count: number }) {
  const [cities, setCities] = useState<CityPoint[]>([]);

  useEffect(() => {
    let alive = true;
    loadCities()
      .then((c) => alive && setCities(c))
      .catch(() => alive && setCities([]));
    return () => {
      alive = false;
    };
  }, []);

  // Taille par rang de population, quantifi�e par pas de 0,5 px (r�gle de l'original).
  const buckets = useMemo(() => {
    const n = Math.min(count, cities.length);
    const SIZE_MAX = 3.6;
    const SIZE_MIN = 1.4;
    const sizeForRank = (i: number) => {
      const t = n > 1 ? i / (n - 1) : 0;
      return SIZE_MAX - (SIZE_MAX - SIZE_MIN) * Math.pow(t, 0.7);
    };
    const bySize = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const [lat, lon] = cities[i]!;
      const size = Math.round(sizeForRank(i) * 2) / 2;
      let pts = bySize.get(size);
      if (!pts) {
        pts = [];
        bySize.set(size, pts);
      }
      pushPoint(pts, lon!, lat!, R + 0.5);
    }
    return [...bySize.entries()]
      .filter(([, pts]) => pts.length > 0)
      .map(([size, pts]) => ({ size, positions: new Float32Array(pts) }));
  }, [cities, count]);

  return (
    <>
      {buckets.map((b) => (
        <points key={`aura-${b.size}`}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[b.positions, 3]} />
          </bufferGeometry>
          {/* Aura douce : une ville lumineuse, pas un point dur. */}
          <pointsMaterial
            map={glowTexture()}
            size={b.size * 4.2}
            color="#ffb54a"
            sizeAttenuation={false}
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>
      ))}
      {buckets.map((b) => (
        <points key={b.size}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[b.positions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={dotTexture()}
            size={b.size}
            color="#ffe2a3"
            // Taille en pixels, pas en unités 3D : au zoom, les villes proches
            // grossissaient jusqu'à devenir des pâtés blancs.
            sizeAttenuation={false}
            transparent
            opacity={1}
            alphaTest={0.01}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>
      ))}
    </>
  );
}

function CableLayer() {
  const [data, setData] = useState<CableWorld | null>(null);
  useEffect(() => {
    let alive = true;
    loadCables()
      .then((c) => alive && setData(c))
      .catch(() => alive && setData({ cables: [], landings: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const lineGeometry = useMemo(() => {
    if (!data || data.cables.length === 0) return null;
    const positions: number[] = [];
    for (const cable of data.cables) {
      for (let i = 1; i < cable.points.length; i++) {
        const a = cable.points[i - 1]!;
        const b = cable.points[i]!;
        // Ignore le point (0,0).
        if ((a[0] === 0 && a[1] === 0) || (b[0] === 0 && b[1] === 0)) continue;

        // Interpolation sur la sphere : sans ca, deux points eloignes sont
        // relies par une corde droite qui traverse l'ocean.
        const va = latLonToVec3(a[1]!, a[0]!, 1);
        const vb = latLonToVec3(b[1]!, b[0]!, 1);
        const omega = Math.acos(Math.min(1, Math.max(-1, va.dot(vb))));
        const steps = Math.max(1, Math.min(16, Math.ceil((omega / Math.PI) * 32)));
        const so = Math.sin(omega) || 1e-6;
        for (let s = 0; s < steps; s++) {
          for (const t of [s / steps, (s + 1) / steps]) {
            const k0 = Math.sin((1 - t) * omega) / so;
            const k1 = Math.sin(t * omega) / so;
            const x = va.x * k0 + vb.x * k1;
            const y = va.y * k0 + vb.y * k1;
            const z = va.z * k0 + vb.z * k1;
            const len = Math.hypot(x, y, z) || 1;
            const rr = R + 0.4;
            positions.push((x / len) * rr, (y / len) * rr, (z / len) * rr);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [data]);

  return (
    <>
      {lineGeometry && (
        <lineSegments geometry={lineGeometry}>
          <lineBasicMaterial
            color={0x2a5e94}
            transparent
            opacity={0.14}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      )}
    </>
  );
}

/** Particules qui circulent le long des c�bles sous-marins. */
function CableParticles() {
  const [data, setData] = useState<CableWorld | null>(null);
  const attrRef = useRef<THREE.BufferAttribute | null>(null);
  const N = 600;

  useEffect(() => {
    let alive = true;
    loadCables()
      .then((c) => alive && setData(c))
      .catch(() => alive && setData({ cables: [], landings: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const state = useMemo(() => {
    const cables = (data?.cables ?? []).filter((c) => c.points.length > 1);
    if (cables.length === 0) return { items: [], positions: new Float32Array(0) };
    const items = Array.from({ length: N }, () => {
      const cable = cables[Math.floor(Math.random() * cables.length)]!;
      return {
        cable,
        t: Math.random(),
        speed: 0.05 + Math.random() * 0.12,
      };
    });
    return { items, positions: new Float32Array(N * 3) };
  }, [data]);

  useFrame((_, delta) => {
    const attr = attrRef.current;
    if (!attr || state.items.length === 0) return;
    const arr = attr.array as Float32Array;

    state.items.forEach((item, i) => {
      item.t += delta * item.speed;
      if (item.t > 1) item.t -= 1;

      const pts = item.cable.points;
      const f = item.t * (pts.length - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(pts.length - 1, i0 + 1);
      const k = f - i0;
      const a = pts[i0]!;
      const b = pts[i1]!;
      const lon = a[0] + (b[0] - a[0]) * k;
      const lat = a[1] + (b[1] - a[1]) * k;

      const phi = (90 - lat) * DEG;
      const theta = (lon + 180) * DEG;
      const r = R + 1.5;
      arr[i * 3] = -r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.cos(phi);
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    });

    attr.needsUpdate = true;
  });

  if (state.items.length === 0) return null;

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          ref={(a) => {
            attrRef.current = a;
          }}
          attach="attributes-position"
          args={[state.positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        map={glowTexture()}
        size={3}
        color="#cfcffd"
        sizeAttenuation
        transparent
        opacity={0.9}
        alphaTest={0.01}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

function slerpArc(a: THREE.Vector3, b: THREE.Vector3, segs = 64): THREE.Vector3[] {
  const va = a.clone().normalize();
  const vb = b.clone().normalize();
  const omega = Math.acos(THREE.MathUtils.clamp(va.dot(vb), -1, 1));
  const so = Math.sin(omega) || 1e-6;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const k0 = Math.sin((1 - t) * omega) / so;
    const k1 = Math.sin(t * omega) / so;
    pts.push(
      new THREE.Vector3(
        va.x * k0 + vb.x * k1,
        va.y * k0 + vb.y * k1,
        va.z * k0 + vb.z * k1,
      )
        .normalize()
        .multiplyScalar(R + SURF_OFFSET),
    );
  }
  return pts;
}

/**
 * Points du tracé d'une étape : le long des câbles quand le serveur en fournit
 * la polyligne (mode Topo), sinon l'arc de grand cercle.
 */
function arcPoints(
  from: [number, number],
  to: [number, number],
  path?: Array<[number, number]>,
): THREE.Vector3[] {
  if (path && path.length > 1) {
    return path.map(([lat, lon]) => latLonToVec3(lat, lon, R + SURF_OFFSET));
  }
  return slerpArc(latLonToVec3(from[0], from[1], 1), latLonToVec3(to[0], to[1], 1));
}

/** Sommet-shader commun aux tracés fusionnés (couleur et indice par sommet). */
const ARC_VERT = `
  attribute vec3 aColor;
  attribute float aArc;
  varying vec3 vColor;
  varying float vArc;
  void main() {
    vColor = aColor;
    vArc = aArc;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * L'animation « tracé progressif » est appliquée par ce fragment-shader plutôt
 * que par une opacité par maillage : tout le trajet tient ainsi en 2 draw calls
 * au lieu de 2 par segment (26 pour 13 sauts).
 */
const ARC_FRAG = `
  uniform float uActive;
  uniform float uLit;
  uniform float uDim;
  varying vec3 vColor;
  varying float vArc;
  void main() {
    float on = (uActive < 0.0 || vArc <= uActive) ? 1.0 : 0.0;
    gl_FragColor = vec4(vColor, mix(uDim, uLit, on));
  }
`;

/**
 * Fusionne des tubes en une géométrie unique en conservant l'index (donc sans
 * multiplier les sommets), avec la couleur et l'indice d'arc par sommet.
 */
function mergeTubes(parts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color; arc: number }>): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const arcIds: number[] = [];
  const indices: number[] = [];
  let offset = 0;

  for (const part of parts) {
    const pos = part.geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      colors.push(part.color.r, part.color.g, part.color.b);
      arcIds.push(part.arc);
    }
    const index = part.geo.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
    }
    offset += pos.count;
    part.geo.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  merged.setAttribute('aArc', new THREE.Float32BufferAttribute(arcIds, 1));
  merged.setIndex(indices);
  return merged;
}

/** Tracé complet (halo + cœur) en deux géométries fusionnées. */
function useArcGeometries(arcs: Array<{ from: [number, number]; to: [number, number]; color: string; index: number; path?: Array<[number, number]> }>) {
  const geometries = useMemo(() => {
    if (arcs.length === 0) return null;
    const cores: Array<{ geo: THREE.BufferGeometry; color: THREE.Color; arc: number }> = [];
    const glows: Array<{ geo: THREE.BufferGeometry; color: THREE.Color; arc: number }> = [];

    for (const arc of arcs) {
      const pts = arcPoints(arc.from, arc.to, arc.path);
      if (pts.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(pts);
      // Finesse plafonnée : invisible à cette échelle, coûteuse en sommets.
      const tubular = Math.max(12, Math.min(320, pts.length * 2));
      const color = new THREE.Color(arc.color);
      cores.push({ geo: new THREE.TubeGeometry(curve, tubular, 0.42, 12, false), color, arc: arc.index });
      glows.push({ geo: new THREE.TubeGeometry(curve, tubular, 1.35, 12, false), color, arc: arc.index });
    }

    if (cores.length === 0) return null;
    return { core: mergeTubes(cores), glow: mergeTubes(glows) };
  }, [arcs]);

  useEffect(() => {
    const current = geometries;
    return () => {
      current?.core.dispose();
      current?.glow.dispose();
    };
  }, [geometries]);

  return geometries;
}

interface Marker {
  key: string;
  position: [number, number, number];
  color: string;
  hop: InspectHop;
}

/**
 * Nœuds instanciés : les 3 maillages par saut (zone de clic, pastille, halo)
 * deviennent 3 draw calls au total, quel que soit le nombre de sauts.
 */
/**
 * Disque net : centre plein et bord adouci sur les 30 % extérieurs. Donne une
 * pastille franchement ronde une fois agrandie, contrairement à une sphère
 * facettée dont la silhouette est un polygone.
 */
function dotTexture(): THREE.CanvasTexture {
  if (dotTex) return dotTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dotTex = new THREE.CanvasTexture(canvas);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}

/**
 * Relais de la trace : une pastille orange, parfaitement ronde, avec une aura
 * lumineuse. Les disques sont des `Points` : toujours face caméra, donc de
 * vrais cercles à n'importe quel zoom, contrairement aux sphères facettées.
 */
function Nodes({ markers, active, onHover }: { markers: Marker[]; active?: number; onHover?: (hop: InspectHop | null) => void }) {
  const count = markers.length;
  const hits = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() }), []);

  // Position des zones de clic (invisibles), une seule fois par jeu de sauts.
  useLayoutEffect(() => {
    const { m, q, p, s } = tmp;
    q.identity();
    s.setScalar(1);
    for (let i = 0; i < count; i++) {
      const marker = markers[i]!;
      p.set(marker.position[0], marker.position[1], marker.position[2]);
      m.compose(p, q, s);
      hits.current?.setMatrixAt(i, m);
    }
    if (hits.current) hits.current.instanceMatrix.needsUpdate = true;
  }, [markers, count, tmp]);

  // Pastilles et auras : décalées vers l'extérieur pour ne pas clignoter
  // contre la surface du globe.
  const { coreGeo, auraGeo, activeGeo } = useMemo(() => {
    const core = new Float32Array(count * 3);
    const aura = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    markers.forEach((marker, i) => {
      v.set(marker.position[0], marker.position[1], marker.position[2]).normalize().multiplyScalar(R + SURF_OFFSET + 2.4);
      core.set([v.x, v.y, v.z], i * 3);
      aura.set([v.x, v.y, v.z], i * 3);
    });

    const make = (arr: Float32Array) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      return g;
    };

    const activeArr = new Float32Array(3);
    const activeMarker = active !== undefined && active >= 0 && active < count ? markers[active] : null;
    if (activeMarker) {
      v.set(activeMarker.position[0], activeMarker.position[1], activeMarker.position[2]).normalize().multiplyScalar(R + SURF_OFFSET + 2.4);
      activeArr.set([v.x, v.y, v.z], 0);
    }

    return { coreGeo: make(core), auraGeo: make(aura), activeGeo: make(activeArr) };
  }, [markers, count, active]);

  useEffect(
    () => () => {
      coreGeo.dispose();
      auraGeo.dispose();
      activeGeo.dispose();
    },
    [coreGeo, auraGeo, activeGeo],
  );

  if (count === 0) return null;

  return (
    <>
      <instancedMesh
        ref={hits}
        args={[undefined, undefined, count]}
        onPointerMove={(e) => {
          e.stopPropagation();
          const id = e.instanceId;
          if (id !== undefined) onHover?.(markers[id]!.hop);
        }}
        onPointerOut={() => onHover?.(null)}
        onClick={(e) => {
          e.stopPropagation();
          const id = e.instanceId;
          if (id !== undefined) onHover?.(markers[id]!.hop);
        }}
      >
        {/* Zone de clic élargie (invisible) pour attraper le nœud facilement. */}
        <sphereGeometry args={[8, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>

      {/* Aura : halo doux, couleur orange. */}
      <points geometry={auraGeo} renderOrder={9}>
        <pointsMaterial
          map={glowTexture()}
          color="#ff9e2c"
          size={30}
          sizeAttenuation={false}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>

      {/* Pastille : disque net, orange. */}
      <points geometry={coreGeo} renderOrder={10}>
        <pointsMaterial map={dotTexture()} color="#ff9e2c" size={9} sizeAttenuation={false} transparent opacity={1} depthWrite={false} toneMapped={false} />
      </points>

      {/* Saut en cours : pastille plus claire, pour suivre l'animation. */}
      {active !== undefined && active >= 0 && active < count && (
        <points geometry={activeGeo} renderOrder={11}>
          <pointsMaterial map={dotTexture()} color="#ffd9a8" size={13} sizeAttenuation={false} transparent opacity={1} depthWrite={false} toneMapped={false} />
        </points>
      )}
    </>
  );
}

/**
 * Intensité du bloom, déduite de la palette de l'apparence.
 *
 * Elle était avant mesurée en lisant les pixels du framebuffer (`readPixels`)
 * toutes les 30 images : c'est une synchronisation GPU complète qui bloque le
 * pipeline et provoquait des à-coups de plusieurs centaines de millisecondes.
 * La luminance de la palette donne le même réglage (fonds sombres = plus de
 * halo, cartes claires = moins) pour zéro coût.
 */
function bloomIntensity(look: Look): number {
  const lum = (hex: string): number => {
    const c = new THREE.Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };
  const mean = lum(look.ocean) * 0.4 + lum(look.land) * 0.45 + lum(look.background) * 0.15;
  const t = Math.min(1, Math.max(0, mean / 0.35));
  return 0.45 - 0.3 * t;
}

/**
 * Mesure la cadence et la remonte. Séparé du reste pour que seuls ses propres
 * abonnements `useFrame` tournent à chaque image.
 */
function PerfReporter({ onSample }: { onSample: (meanMs: number) => void }) {
  const acc = useRef({ t: 0, n: 0, warm: 0 });
  useFrame((_, delta) => {
    const a = acc.current;
    a.t += delta;
    a.n += 1;
    if (a.t < 0.6) return;
    const meanMs = (a.t / a.n) * 1000;
    a.t = 0;
    a.n = 0;
    // Les premières mesures incluent la compilation des shaders : on ignore.
    if (a.warm < 3) {
      a.warm += 1;
      return;
    }
    onSample(meanMs);
  });
  return null;
}

/**
 * Photon : un point lumineux qui parcourt tout le chemin en boucle,
 * avec un halo additif � l'animation du site de r�f�rence.
 */
function Photon({ located }: { located: InspectHop[] }) {
  const ref = useRef<THREE.Group>(null);
  const progress = useRef(0);

  const curve = useMemo(() => {
    if (located.length < 2) return null;
    const points: THREE.Vector3[] = [];
    for (let i = 1; i < located.length; i++) {
      const from = located[i - 1]!;
      const to = located[i]!;
      const leg = arcPoints([from.lat!, from.lon!], [to.lat!, to.lon!], to.polyline);
      for (let k = i === 1 ? 0 : 1; k < leg.length; k++) points.push(leg[k]!);
    }
    return new THREE.CatmullRomCurve3(points);
  }, [located]);

  useFrame((_, delta) => {
    if (!ref.current || !curve) return;
    progress.current = (progress.current + delta * 0.045) % 1;
    // Le photon flotte un peu au-dessus de la surface : posé dessus, il la rase
    // et le test de profondeur le fait clignoter ou disparaître.
    const point = curve.getPointAt(progress.current);
    ref.current.position.copy(point).addScaledVector(point.clone().normalize(), 1.6);
  });

  if (!curve) return null;

  return (
    <group ref={ref}>
      <mesh renderOrder={12}>
        <sphereGeometry args={[1.5, 16, 16]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <sprite scale={[9, 9, 1]} renderOrder={11}>
        <spriteMaterial
          map={glowTexture()}
          color="#fff2d8"
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

function Stars({ color }: { color: string }) {
  const geometry = useMemo(() => {
    const N = 1800;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = 2600 + rnd() * 1600;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
      // Éclat varié : quelques étoiles franches, beaucoup de très faibles.
      const lum = 0.3 + Math.pow(rnd(), 1.6) * 0.7;
      col.set([lum, lum, Math.min(1, lum * 1.06)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        map={dotTexture()}
        // Taille en pixels : avec l'atténuation, des étoiles à 3000 unités
        // tombaient sous le pixel et restaient invisibles.
        size={2.2}
        sizeAttenuation={false}
        color={color}
        vertexColors
        transparent
        opacity={0.95}
        alphaTest={0.01}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function Camera({ focus }: { focus: THREE.Vector3 | null }) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const c = new OrbitControls(camera as THREE.PerspectiveCamera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 500;
    c.maxDistance = 1000;
    c.enablePan = false;
    controls.current = c;
    return () => c.dispose();
  }, [camera, gl]);

  useEffect(() => {
    if (!focus) return;
    const dir = focus
      .clone()
      .normalize()
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), TILT)
      .multiplyScalar(820);
    if (dir.length() < 1) dir.set(0, 120, 820);
    camera.position.copy(dir);
    camera.lookAt(0, 0, 0);
  }, [focus, camera]);

  useFrame(() => controls.current?.update());
  return null;
}

interface GlobeProps {
  hops: InspectHop[];
  look: Look;
  showCities: boolean;
  showCables: boolean;
  /** Index du saut actif (animation / curseur). -1 = tout allumé. */
  active?: number;
}

function Scene({ hops, look, showCities, showCables, world, active, onHover }: GlobeProps & { world: WorldData | null; onHover?: (hop: InspectHop | null) => void }) {
  const located = useMemo(() => hops.filter((h) => h.lat !== null && h.lon !== null), [hops]);

  const focus = useMemo(() => {
    if (located.length === 0) return null;
    const sum = located.reduce((acc, h) => acc.add(latLonToVec3(h.lat!, h.lon!, 1)), new THREE.Vector3());
    return sum.divideScalar(located.length);
  }, [located]);

  const markers = useMemo(
    () =>
      located.map((h, i) => ({
        key: `${h.ttl}-${h.ip}`,
        position: latLonToVec3(h.lat!, h.lon!, R + SURF_OFFSET + 1).toArray() as [number, number, number],
          color: '#ff9e2c',
        hop: h,
      })),
    [located],
  );

  const arcs = useMemo(() => {
    const out: Array<{ key: string; from: [number, number]; to: [number, number]; color: string; index: number; path?: Array<[number, number]> }> = [];
    for (let i = 1; i < located.length; i++) {
      const from = located[i - 1]!;
      const to = located[i]!;
      out.push({
        key: `${i}`,
        from: [from.lat!, from.lon!],
        to: [to.lat!, to.lon!],
        color: to.color,
        index: i,
        ...(to.polyline ? { path: to.polyline } : {}),
      });
    }
    return out;
  }, [located]);

  const arcGeometries = useArcGeometries(arcs);
  const arcUniforms = useMemo(
    () => ({
      glow: { uActive: { value: -1 }, uLit: { value: 0.14 }, uDim: { value: 0.03 } },
      core: { uActive: { value: -1 }, uLit: { value: 1 }, uDim: { value: 0.28 } },
    }),
    [],
  );

  useEffect(() => {
    const value = active === undefined ? -1 : active;
    arcUniforms.glow.uActive.value = value;
    arcUniforms.core.uActive.value = value;
  }, [active, arcUniforms]);

  return (
    <>
      <Stars color={look.stars} />
      <Camera focus={focus} />

      <group rotation={[0, 0, TILT]}>
        <Earth world={world} look={look} />
        {showCables && (
          <>
            <CableLayer />
            <CableParticles />
          </>
        )}
        {showCities && <CityDots count={1251} />}
        {arcGeometries && (
          <>
            <mesh geometry={arcGeometries.glow} renderOrder={2}>
              <shaderMaterial
                uniforms={arcUniforms.glow}
                vertexShader={ARC_VERT}
                fragmentShader={ARC_FRAG}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <mesh geometry={arcGeometries.core} renderOrder={3}>
              <shaderMaterial
                uniforms={arcUniforms.core}
                vertexShader={ARC_VERT}
                fragmentShader={ARC_FRAG}
                transparent
                depthWrite={false}
              />
            </mesh>
          </>
        )}
        <Nodes markers={markers} active={active} onHover={onHover} />
        <Photon located={located} />
      </group>
    </>
  );
}

export function Globe(props: GlobeProps) {
  const [world, setWorld] = useState<WorldData | null>(null);
  const [hover, setHover] = useState<InspectHop | null>(null);
  /**
   * Résolution adaptative : on démarre à 1 (fluide même sur un GPU faible) et
   * on monte par paliers tant que la cadence le permet. C'est le levier n°1 :
   * le coût est proportionnel au nombre de pixels. Le DPR est passé en prop
   * (et non via `setDpr`) pour garantir le redimensionnement du tampon.
   */
  /**
   * Résolution adaptative. Plancher **1** : on ne descend jamais sous la
   * résolution CSS, sinon le globe paraît flou à côté de l'interface (qui est
   * rendue, elle, au DPR de l'écran). Le budget se gagne d'abord en coupant le
   * bloom, ensuite seulement on baisse la cadence.
   */
  const maxDpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2);
  const dprRef = useRef(1);
  const [dpr, setDpr] = useState(1);
  const [bloomOn, setBloomOn] = useState(true);

  const onSample = useCallback(
    (meanMs: number) => {
      // 1. Le post-traitement est le premier sacrifice : il ne coûte que
      //    lorsque le GPU suit. À 1× déjà trop lent, on le coupe.
      if (bloomOn && meanMs > 30 && dprRef.current <= 1) {
        setBloomOn(false);
        return;
      }
      // 2. Ensuite la résolution, sans jamais passer sous 1 : on monte tant
      //    qu'on reste au-dessus de ~40 fps, sinon on redescend (hystérésis de
      //    6 ms pour éviter l'oscillation).
      if (meanMs > 30 && dprRef.current > 1) {
        dprRef.current = Math.max(1, dprRef.current - 0.25);
        setDpr(dprRef.current);
      } else if (meanMs < 24 && dprRef.current < maxDpr) {
        dprRef.current = Math.min(maxDpr, dprRef.current + 0.25);
        setDpr(dprRef.current);
      }
    },
    [bloomOn, maxDpr],
  );

  useEffect(() => {
    let alive = true;
    loadWorld()
      .then((w) => alive && setWorld(w))
      .catch(() => alive && setWorld({ land: [], countries: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const intensity = useMemo(() => bloomIntensity(props.look), [props.look]);

  return (
    <>
      <Canvas
        // `preserveDrawingBuffer` et l'antialiasing de contexte sont inutiles
        // ici (le composer gère l'anticrénelage) et coûtaient une copie par image.
        camera={{ position: [0, 120, 820], fov: 30, near: 1, far: 10000 }}
        dpr={dpr}
        gl={{ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[props.look.background]} />
        <PerfReporter onSample={onSample} />
        <Scene {...props} world={world} onHover={setHover} />
        {/* MSAA 4× divisait la cadence par deux sur GPU intégré : 0. */}
        {bloomOn && (
          <EffectComposer multisampling={0}>
            <Bloom intensity={intensity} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur levels={5} />
          </EffectComposer>
        )}
      </Canvas>

      {hover && (
        <div className="globe-tip">
          <span className="num">#{hover.ttl}</span>
          <img src={`/flags/${(hover.country ?? 'xx').toLowerCase()}.svg`} alt="" />
          <strong>{hover.city ?? '—'}</strong>
          <span className="cc">({hover.country ?? '—'})</span>
          <span className="ms">{hover.rttMs} ms</span>
        </div>
      )}
    </>
  );
}
