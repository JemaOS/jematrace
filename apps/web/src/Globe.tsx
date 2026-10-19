import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { InspectHop } from './api';
import { buildEarthTexture, earthTextureWidth } from './earthTexture';
import { cablePalette, type Look } from './looks';
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
  // `maxTextureSize` évite de demander au GPU plus qu'il ne sait faire.
  const maxTexture = useThree((s) => s.gl.capabilities.maxTextureSize);
  const texture = useMemo(
    () => (world ? buildEarthTexture(world, look, Math.min(earthTextureWidth(), maxTexture)) : null),
    [world, look, maxTexture],
  );
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

/**
 * Échelle des éléments dessinés en pixels (points, halos).
 *
 * Le globe occupe beaucoup moins de place sur un téléphone : une aura de 13 px
 * par ville couvre alors une grande partie du disque et, en additif, sature
 * tout en blanc. On réduit donc les tailles avec la largeur réelle.
 */
function useUiScale(): number {
  const width = useThree((s) => s.size.width);
  return Math.min(1, Math.max(0.38, width / 900));
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

  const k = useUiScale();

  // Taille par rang de population, quantifiee par pas de 0,5 px.
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
            size={b.size * 3.4 * k}
            color="#ffb54a"
            sizeAttenuation={false}
            transparent
            opacity={0.13}
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
            size={b.size * k}
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

interface CableBatch {
  geometry: THREE.BufferGeometry;
  /** Année → nombre de sommets cumulés : permet un `setDrawRange`. */
  stops: Array<{ year: number; count: number }>;
}

/**
 * Câbles sous-marins, avec la palette d'états de la carte de référence :
 * cyan pour un câble existant, orange pour ceux mis en service cette année-là,
 * rouge pour ceux retirés cette année-là.
 *
 * La géométrie est découpée en lots, ce qui évite toute reconstruction pendant
 * la lecture :
 *  - `permanent`  : câbles toujours en service, triés par année → drawRange ;
 *  - `retired`    : un lot par année de retrait, trié par année de mise en
 *                   service → drawRange, masqué après le retrait, coloré en
 *                   rouge l'année du retrait ;
 *  - `isNew`      : overlay orange des câbles de l'année courante, reconstruit
 *                   à chaque changement d'année (quelques câbles seulement).
 */
function CableLayer({
  year,
  light,
  selected,
  onSelect,
  hovered = null,
  onHover,
}: {
  year: number;
  light: boolean;
  selected?: string | null;
  onSelect?: (name: string) => void;
  /** Câble survolé : tracé en blanc, comme la sélection. */
  hovered?: string | null;
  /** Nom du câble sous le curseur, avec la position de l'infobulle. */
  onHover?: (name: string | null, at?: { x: number; y: number }) => void;
}) {
  const [data, setData] = useState<CableWorld | null>(null);
  const permanentRef = useRef<CableBatch | null>(null);

  useEffect(() => {
    let alive = true;
    loadCables()
      .then((c) => alive && setData(c))
      .catch(() => alive && setData({ cables: [], landings: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const palette = useMemo(() => cablePalette(light), [light]);
  const regular = useMemo(() => new THREE.Color(palette.regular.color), [palette]);
  const isNewColor = useMemo(() => new THREE.Color(palette.isNew.color), [palette]);
  const decommissioned = useMemo(() => new THREE.Color(palette.decommissioned.color), [palette]);
  const selectedColor = useMemo(() => new THREE.Color(palette.selected.color), [palette]);

  /** Sommets d'un câble, interpolés sur la sphère. */
  const pushCable = (positions: number[], cable: CableWorld['cables'][number]) => {
    for (const line of cable.lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!;
        const b = line[i]!;
        if ((a[0] === 0 && a[1] === 0) || (b[0] === 0 && b[1] === 0)) continue;

        // Sans interpolation, deux points éloignés seraient reliés par une
        // corde droite qui traverse l'océan.
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
  };

  /** Assemble des câbles triés par année et mémorise les seuils cumulés. */
  const makeBatch = (cables: CableWorld['cables']): CableBatch => {
    const sorted = [...cables].sort((a, b) => a.year - b.year);
    const positions: number[] = [];
    const stops: CableBatch['stops'] = [];

    for (const cable of sorted) {
      pushCable(positions, cable);
      if (stops.length === 0 || stops[stops.length - 1]!.year !== cable.year) {
        stops.push({ year: cable.year, count: positions.length / 3 });
      } else {
        stops[stops.length - 1]!.count = positions.length / 3;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return { geometry, stops };
  };

  const model = useMemo(() => {
    if (!data) return null;

    const permanent = makeBatch(data.cables.filter((c) => c.end === null));

    const byEnd = new Map<number, CableWorld['cables']>();
    for (const cable of data.cables) {
      if (cable.end === null) continue;
      const list = byEnd.get(cable.end) ?? [];
      list.push(cable);
      byEnd.set(cable.end, list);
    }
    const retired = [...byEnd.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([end, cables]) => ({ end, batch: makeBatch(cables) }));

    return { permanent, retired };
  }, [data]);

  /** Overlay orange : uniquement les câbles mis en service cette année. */
  const newBatch = useMemo(() => {
    if (!data) return null;
    /**
     * « Nouveau » = mis en service cette année **et pas encore retiré**.
     *
     * Le câble de 1858 a été retiré la même année : il doit être rouge, pas
     * orange. L'overlay orange était dessiné par-dessus le lot rouge et le
     * masquait entièrement.
     */
    const cables = data.cables.filter((c) => c.year === year && (c.end === null || c.end > year));
    if (cables.length === 0) return null;
    return makeBatch(cables);
  }, [data, year]);

  /**
   * Zone de clic : une géométrie des câbles **visibles cette année-là**, avec
   * la correspondance index → nom (`owners`). Le raycast d'une `Line` renvoie
   * l'index du premier sommet du segment : `owners[index / 2]`.
   */
  const picking = useMemo(() => {
    if (!data || !onSelect) return null;
    const cables = data.cables.filter(
      (c) => c.year <= year && (c.end === null || c.end >= year),
    );
    const positions: number[] = [];
    const owners: string[] = [];
    for (const cable of cables) {
      for (const line of cable.lines) {
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1]!;
          const b = line[i]!;
          if ((a[0] === 0 && a[1] === 0) || (b[0] === 0 && b[1] === 0)) continue;
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
          owners.push(cable.name);
        }
      }
    }
    if (positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return { geometry, owners };
  }, [data, year, onSelect]);

  useEffect(() => {
    if (!picking) return;
    return () => picking.geometry.dispose();
  }, [picking]);

  /**
  /**
   * Câble mis en avant (sélection ou survol) : tracé blanc par-dessus les
   * autres, pour ne pas le confondre avec un câble cyan ou orange.
   */
  const highlight = selected ?? hovered;
  const selectedBatch = useMemo(() => {
    if (!data || !highlight) return null;
    const cable = data.cables.find((c) => c.name === highlight);
    if (!cable) return null;
    if (cable.year > year || (cable.end !== null && cable.end < year)) return null;
    return makeBatch([cable]);
  }, [data, highlight, year]);

  useEffect(() => {
    if (!selectedBatch) return;
    return () => selectedBatch.geometry.dispose();
  }, [selectedBatch]);

  // Seuil de raycast plus large : les câbles sont des lignes d'épaisseur nulle.
  const { raycaster } = useThree();
  useEffect(() => {
    raycaster.params.Line = { threshold: 2.4 };
  }, [raycaster]);
  // Libération des géométries remplacées.
  useEffect(() => {
    if (!model) return;
    return () => {
      model.permanent.geometry.dispose();
      for (const item of model.retired) item.batch.geometry.dispose();
    };
  }, [model]);

  useEffect(() => {
    if (!newBatch) return;
    return () => newBatch.geometry.dispose();
  }, [newBatch]);

  const countUpTo = (stops: CableBatch['stops'], at: number) => {
    let count = 0;
    for (const step of stops) {
      if (step.year > at) break;
      count = step.count;
    }
    return count;
  };

  useEffect(() => {
    const batch = model?.permanent;
    if (!batch) return;
    permanentRef.current = batch;
    batch.geometry.setDrawRange(0, countUpTo(batch.stops, year));
  }, [model, year]);

  return (
    <>
      {model && (
        <lineSegments geometry={model.permanent.geometry}>
          <lineBasicMaterial
            color={regular}
            transparent
            opacity={palette.regular.opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      )}

      {model?.retired.map((item) => {
        // Visible jusqu'à l'année du retrait inclus ; rouge cette année-là.
        const visible = year <= item.end;
        const color = year === item.end ? decommissioned : regular;
        if (visible) item.batch.geometry.setDrawRange(0, countUpTo(item.batch.stops, year));
        return (
          <lineSegments key={item.end} geometry={item.batch.geometry} visible={visible}>
            <lineBasicMaterial
              color={color}
              transparent
              opacity={year === item.end ? palette.decommissioned.opacity : palette.regular.opacity}
              depthWrite={false}
              toneMapped={false}
            />
          </lineSegments>
        );
      })}

      {newBatch && (
        // Légèrement au-dessus des autres câbles pour ressortir sans clignoter.
        <lineSegments geometry={newBatch.geometry} position={[0, 0, 0]} renderOrder={1}>
          <lineBasicMaterial
            color={isNewColor}
            transparent
            opacity={palette.isNew.opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      )}

      {/* Câble sélectionné : blanc, au-dessus du réseau. */}
      {selectedBatch && (
        <lineSegments geometry={selectedBatch.geometry} renderOrder={2}>
          <lineBasicMaterial
            color={selectedColor}
            transparent
            opacity={palette.selected.opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      )}

      {/* Zone de clic invisible : le nom du câble s'ouvre au clic. */}
      {picking && (
        <lineSegments
          geometry={picking.geometry}
          renderOrder={3}
          onClick={(e) => {
            if (!onSelect) return;
            e.stopPropagation();
            const idx = e.intersections?.[0]?.index;
            if (idx === undefined) return;
            const name = picking.owners[Math.floor(idx / 2)];
            if (name) onSelect(name);
          }}
        >
          <lineBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
        </lineSegments>
      )}
    </>
  );
}

/** Particules qui circulent le long des c�bles sous-marins. */
/**
 * Particules qui parcourent les câbles.
 *
 * Deux précautions indispensables :
 *  - elles ne voyagent que sur les câbles **visibles à l'année affichée** ;
 *    sinon on voyait des points lumineux dans l'océan, sur des câbles qui
 *    n'existaient pas encore (ou déjà retirés) ;
 *  - la position est interpolée **sur la sphère** entre deux points du tracé :
 *    une interpolation en longitude traverse la planète d'un bord à l'autre
 *    quand le câble franchit l'antiméridien.
 */
function CableParticles({ year }: { year: number }) {
  const [data, setData] = useState<CableWorld | null>(null);
  const attrRef = useRef<THREE.BufferAttribute | null>(null);
  const geomRef = useRef<THREE.BufferGeometry | null>(null);
  const N = 600;

  /**
   * Tampon de positions alloué une fois pour toutes.
   *
   * Il ne change jamais de taille : quand le nombre de particules varie (peu
   * de câbles en 1863, beaucoup en 2026), on ajuste le `drawRange`. Un tableau
   * redimensionné laissait les anciennes positions dans le tampon GPU, et des
   * points apparaissaient là où aucun câble n'est dessiné.
   */
  const positionsRef = useRef<Float32Array>(new Float32Array(N * 3));

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
    // Seuls les câbles **en service cette année-là** : une particule ne doit
    // jamais voyager sur un câble qui n'est pas encore posé (ou déjà retiré).
    const cables = (data?.cables ?? []).filter(
      (c) => c.lines.length > 0 && c.year <= year && (c.end === null || c.end >= year),
    );
    if (cables.length === 0) return { items: [], count: 0 };

    /**
     * Nombre proportionnel au réseau visible : 600 particules fixes sur les
     * quelques câbles de 1863 formeraient un collier continu.
     */
    const count = Math.min(N, Math.max(12, cables.length * 3));
    const items = Array.from({ length: count }, () => {
      const cable = cables[Math.floor(Math.random() * cables.length)]!;
      // La ligne la plus longue du câble : la particule parcourt tout le tracé.
      const points = cable.lines.reduce((best, l) => (l.length > best.length ? l : best), cable.lines[0]!);
      return { points, t: Math.random(), speed: 0.05 + Math.random() * 0.12 };
    });

    return { items, count };
  }, [data, year]);

  // Nombre de sommets réellement dessinés.
  useEffect(() => {
    geomRef.current?.setDrawRange(0, state.count);
  }, [state]);

  useFrame((_, delta) => {
    const attr = attrRef.current;
    if (!attr || state.count === 0) return;
    const arr = positionsRef.current;

    for (let i = 0; i < state.count; i++) {
      const item = state.items[i]!;
      item.t += delta * item.speed;
      if (item.t > 1) item.t -= 1;

      const pts = item.points;
      const f = item.t * (pts.length - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(pts.length - 1, i0 + 1);
      const k = f - i0;
      const a = pts[i0]!;
      const b = pts[i1]!;

      // Interpolation sphérique : correcte au passage de l'antiméridien, où
      // une interpolation en longitude traverserait la planète.
      const va = latLonToVec3(a[1]!, a[0]!, 1);
      const vb = latLonToVec3(b[1]!, b[0]!, 1);
      const p = va.lerp(vb, k).normalize().multiplyScalar(R + 0.7);
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }

    attr.needsUpdate = true;
  });

  if (state.count === 0) return null;

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          ref={(a) => {
            attrRef.current = a;
          }}
          attach="attributes-position"
          args={[positionsRef.current, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        map={glowTexture()}
        size={3}
        color="#cfcffd"
        sizeAttenuation
        transparent
        opacity={0.45}
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

/**
 * Fusionne des tubes en une géométrie unique en conservant l'index (donc sans
 * multiplier les sommets), avec la couleur par sommet.
 *
 * L'attribut s'appelle `color` : c'est le nom que `meshBasicMaterial` lit avec
 * `vertexColors` (l'ancien shader attendait `aColor`, d'où un tracé noir).
 */
function mergeTubes(parts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color; arc: number }>): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let offset = 0;

  for (const part of parts) {
    const pos = part.geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      colors.push(part.color.r, part.color.g, part.color.b);
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
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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
      cores.push({ geo: new THREE.TubeGeometry(curve, tubular, 0.8, 12, false), color, arc: arc.index });
      glows.push({ geo: new THREE.TubeGeometry(curve, tubular, 2.6, 12, false), color, arc: arc.index });
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
function Nodes({ markers, onHover }: { markers: Marker[]; onHover?: (hop: InspectHop | null, at?: { x: number; y: number }) => void }) {
  const k = useUiScale();
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
  const { coreGeo, auraGeo } = useMemo(() => {
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

    return { coreGeo: make(core), auraGeo: make(aura) };
  }, [markers, count]);

  useEffect(
    () => () => {
      coreGeo.dispose();
      auraGeo.dispose();
    },
    [coreGeo, auraGeo],
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
          if (id !== undefined) {
            onHover?.(markers[id]!.hop, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
          }
        }}
        onPointerOut={() => onHover?.(null)}
        onClick={(e) => {
          e.stopPropagation();
          const id = e.instanceId;
          if (id !== undefined) {
            onHover?.(markers[id]!.hop, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
          }
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
          size={30 * k}
          sizeAttenuation={false}
          transparent
          opacity={0.32}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>

      {/* Pastille : disque net, orange. */}
      <points geometry={coreGeo} renderOrder={10}>
        <pointsMaterial map={dotTexture()} color="#ff9e2c" size={9 * k} sizeAttenuation={false} transparent opacity={1} depthWrite={false} toneMapped={false} />
      </points>
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
 * Bloom, coupé sous 700 px de large.
 *
 * Sur un téléphone, le canvas est petit : à cette résolution le flou du bloom
 * couvre une grande partie du disque et noie le globe dans un voile blanc.
 * Les halos additifs (villes, câbles, atmosphère) suffisent alors à donner
 * l'effet lumineux, sans surcoût.
 */
function BloomLayer({ intensity }: { intensity: number }) {
  const width = useThree((s) => s.size.width);
  if (width < 700) return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={intensity} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur levels={5} />
    </EffectComposer>
  );
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
  const sprite = useRef<THREE.Sprite>(null);
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
    // Vitesse du site de référence : `u = (time * 0.18) % 1`, soit un tour
    // complet en ~5,6 s (nous étions à 0.045, donc quatre fois trop lent).
    progress.current = (progress.current + delta * 0.18) % 1;
    const u = progress.current;

    // Le photon flotte un peu au-dessus de la surface : posé dessus, il la rase
    // et le test de profondeur le fait clignoter ou disparaître.
    const point = curve.getPointAt(u);
    ref.current.position.copy(point).addScaledVector(point.clone().normalize(), 1.6);

    // Opacité du halo selon la position sur le trajet (0,55 → 1 → 0,55), comme
    // la référence : le photon s'efface à l'approche des deux extrémités.
    if (sprite.current) {
      (sprite.current.material as THREE.SpriteMaterial).opacity = 0.55 + 0.45 * Math.sin(u * Math.PI);
    }
  });

  if (!curve) return null;

  return (
    <group ref={ref}>
      <mesh renderOrder={12}>
        <sphereGeometry args={[1.5, 16, 16]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <sprite ref={sprite} scale={[9, 9, 1]} renderOrder={11}>
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
  const k = useUiScale();
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
        size={Math.max(1.4, 2.2 * k)}
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
  const { camera, gl, size } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  /** Position visée par la caméra, et premier cadrage déjà appliqué. */
  const target = useRef<THREE.Vector3 | null>(null);
  const settled = useRef(false);

  /**
   * Distance à laquelle le globe (atmosphère comprise) tient entièrement dans
   * la vue.
   *
   * Le fov est **vertical** : sur un écran étroit, c'est la largeur qui
   * contraint. Il faut alors reculer bien plus que sur un écran large. Sans ce
   * calcul, le plafond de dézoom (1 000) coupait le globe sur mobile et
   * empêchait de le voir en entier.
   */
  const fitDistance = useMemo(() => {
    const halfV = (30 * DEG) / 2;
    const aspect = size.width / Math.max(1, size.height);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const half = Math.min(halfV, halfH);
    return (R * 1.18) / Math.max(0.05, Math.sin(half)) + 40;
  }, [size.width, size.height]);

  useEffect(() => {
    const c = new OrbitControls(camera as THREE.PerspectiveCamera, gl.domElement);
    /**
     * Sur écran tactile, la rotation est bien trop rapide par défaut :
     * OrbitControls divise le déplacement par la **hauteur** de l'élément et
     * multiplie par `rotateSpeed` (1). Sur un téléphone, un glissement d'une
     * largeur d'écran fait donc presque un tour complet. On ralentit
     * franchement, avec un amorti plus ferme pour éviter la glisse.
     */
    const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    // Une tablette ou un pliable ouvert a une surface large : inutile de
    // ralentir autant que sur un téléphone étroit.
    const smallTouch = coarse && size.width < 700;
    c.rotateSpeed = coarse ? (smallTouch ? 0.42 : 0.62) : 1;
    c.zoomSpeed = coarse ? (smallTouch ? 0.55 : 0.75) : 1;
    c.enableDamping = true;
    c.dampingFactor = coarse ? 0.14 : 0.08;
    c.enablePan = false;
    // On peut reculer nettement au-delà du cadrage « globe entier » — c'est ce
    // qui manquait : l'ancien plafond fixe de 1 000 empêchait de dézoomer sur
    // mobile — sans pour autant réduire le globe à un point.
    c.maxDistance = fitDistance * 1.6;
    c.minDistance = Math.max(260, R * 1.3);
    c.update();
    controls.current = c;
    return () => c.dispose();
  }, [camera, gl, fitDistance, size.width]);

  useEffect(() => {
    if (!focus) return;
    // Grand écran : cadrage de référence (820). Écran étroit : distance
    // calculée, sinon le globe arrive déjà coupé en arrivant sur la page.
    const aspect = size.width / Math.max(1, size.height);
    const distance = aspect >= 1.1 ? Math.min(820, fitDistance) : fitDistance;
    const dir = focus
      .clone()
      .normalize()
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), TILT)
      .multiplyScalar(distance);
    if (dir.length() < 1) dir.set(0, 120, 820);
    // Transition douce : on vise la nouvelle position et `useFrame` y glisse la
    // caméra. Un saut sec toutes les cinq secondes serait désagréable.
    target.current = dir;
    if (!settled.current) {
      camera.position.copy(dir);
      camera.lookAt(0, 0, 0);
      controls.current?.update();
      settled.current = true;
    }
  }, [focus, camera, fitDistance, size.width, size.height]);

  useFrame((_, delta) => {
    const goal = target.current;
    if (goal) {
      // Interpolation indépendante de la cadence (~0,9 s pour arriver).
      const k = Math.min(1, delta * 3.2);
      camera.position.lerp(goal, k);
      camera.lookAt(0, 0, 0);
      if (camera.position.distanceTo(goal) < 1) {
        camera.position.copy(goal);
        target.current = null;
      }
    }
    controls.current?.update();
  });
  return null;
}

interface GlobeProps {
  hops: InspectHop[];
  look: Look;
  showCities: boolean;
  showCables: boolean;
  /** Année de la frise : seuls les câbles mis en service jusque-là sont visibles. */
  year: number;
  /** Câbles de l'année : le globe tourne vers eux. */
  focusPoint?: { lat: number; lon: number } | null;
  /** Thème clair : la palette des câbles s'inverse (cf. `cablePalette`). */
  light?: boolean;
  /** Câble ouvert dans la fiche : tracé en blanc. */
  selected?: string | null;
  /** Ouvre la fiche d'un câble au clic sur son tracé. */
  onCable?: (name: string) => void;
  /** Point demandé depuis une fiche de câble (atterrissage cliqué). */
  at?: { lat: number; lon: number } | null;
  /** Câble survolé : tracé en blanc. */
  hoveredCable?: string | null;
  /** Nom du câble sous le curseur, avec la position de l'infobulle. */
  onCableHover?: (name: string | null, at?: { x: number; y: number }) => void;
}

function Scene({ hops, look, showCities, showCables, world, year, focusPoint, light = false, selected = null, hoveredCable = null, onCable, onCableHover, at, onHover }: GlobeProps & { world: WorldData | null; onHover?: (hop: InspectHop | null, at?: { x: number; y: number }) => void }) {
  const wide = useThree((s) => s.size.width) >= 700;
  const located = useMemo(() => hops.filter((h) => h.lat !== null && h.lon !== null), [hops]);

  const focus = useMemo(() => {
    // La frise est prioritaire : quand on rejoue l'histoire, le globe se tourne
    // vers le câble de l'année plutôt que vers le milieu du traceroute.
    if (focusPoint) return latLonToVec3(focusPoint.lat, focusPoint.lon, 1);
    if (located.length === 0) return null;
    const sum = located.reduce((acc, h) => acc.add(latLonToVec3(h.lat!, h.lon!, 1)), new THREE.Vector3());
    return sum.divideScalar(located.length);
  }, [located, focusPoint, at]);

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
  /** Câble survolé et position du curseur : affiche son nom à côté du pointeur. */
  const [cableHover, setCableHover] = useState<{ name: string; x: number; y: number } | null>(null);


  return (
    <>
      <Stars color={look.stars} />
      <Camera focus={focus} />

      <group rotation={[0, 0, TILT]}>
        <Earth world={world} look={look} />
        {showCables && (
          <>
            <CableLayer
              year={year}
              light={light}
              selected={selected}
              onSelect={onCable}
              hovered={cableHover?.name ?? null}
              onHover={(name, at) =>
                setCableHover(name && at ? { name, x: at.x, y: at.y } : null)
              }
            />
            {/* Particules circulant sur les câbles : mouvement continu, donc
                coupé sur mobile pour alléger le GPU. */}
            {wide && <CableParticles year={year} />}
          </>
        )}
        {showCities && <CityDots count={1251} />}
        {arcGeometries && (
          <>
            {/* Halo du tracé : statique, couleur par sommet. */}
            <mesh geometry={arcGeometries.glow} renderOrder={2}>
              <meshBasicMaterial
                vertexColors
                transparent
                opacity={0.14}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            {/* Trait net : couleur par sommet, aucune animation. */}
            <mesh geometry={arcGeometries.core} renderOrder={3}>
              <meshBasicMaterial vertexColors depthWrite={false} toneMapped={false} />
            </mesh>
          </>
        )}
        <Nodes markers={markers} onHover={onHover} />
        <Photon located={located} />
      </group>
    </>
  );
}

export function Globe(props: GlobeProps) {
  const [world, setWorld] = useState<WorldData | null>(null);
  const [hover, setHover] = useState<{ hop: InspectHop; x: number; y: number } | null>(null);
  /** Câble sous le curseur (nom + position) : nom affiché près du pointeur. */
  const [cableHover, setCableHover] = useState<{ name: string; x: number; y: number } | null>(null);
  /**
   * Jeton de reconstruction. Un contexte WebGL perdu (mémoire insuffisante,
   * onglet laissé en arrière-plan) laissait un globe figé ou entièrement blanc :
   * on reconstruit alors toute la scène, sans attendre un rechargement.
   */
  const [glKey, setGlKey] = useState(0);

  /**
   * Reconstruction après perte de contexte. Un court délai laisse au navigateur
   * le temps de libérer l'ancien contexte ; les tentatives sont espacées et
   * plafonnées, pour ne pas boucler sur un appareil incapable de créer un
   * contexte (économie d'énergie extrême).
   */
  const lostRef = useRef(0);
  const remountTimer = useRef<number | null>(null);

  const recomputeKey = useCallback(() => {
    if (lostRef.current >= 3) return;
    lostRef.current += 1;
    if (remountTimer.current) window.clearTimeout(remountTimer.current);
    remountTimer.current = window.setTimeout(() => setGlKey((k) => k + 1), 150 * lostRef.current);
  }, []);

  useEffect(
    () => () => {
      if (remountTimer.current) window.clearTimeout(remountTimer.current);
    },
    [],
  );
  /**
   * Résolution calibrée **une fois**, puis figée.
   *
   * Elle était réévaluée en continu : chaque zoom changeait la cadence, donc le
   * DPR, donc la netteté de l'image — d'où une impression d'animation des
   * lumières par paliers. On mesure pendant les premières secondes, on choisit,
   * et on ne touche plus à rien.
   *
   * Plancher à 1 : on ne descend jamais sous la résolution CSS, sinon le globe
   * paraît flou à côté de l'interface (rendue, elle, au DPR de l'écran).
   */
  const maxDpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2);
  const [dpr, setDpr] = useState(1);
  const [bloomOn, setBloomOn] = useState(true);
  const calibratedRef = useRef(false);
  const samplesRef = useRef<number[]>([]);

  const onSample = useCallback(
    (meanMs: number) => {
      if (calibratedRef.current) return;
      // Trois mesures consécutives, puis décision définitive.
      samplesRef.current.push(meanMs);
      if (samplesRef.current.length < 3) return;
      calibratedRef.current = true;

      const median = [...samplesRef.current].sort((a, b) => a - b)[1]!;
      if (median > 30) {
        // GPU trop juste pour le post-traitement : on garde la netteté.
        setBloomOn(false);
        setDpr(1);
      } else if (median < 22) {
        setDpr(maxDpr);
      } else {
        setDpr(Math.min(maxDpr, 1.25));
      }
    },
    [maxDpr],
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

  // L'infobulle suit le nœud touché, en restant dans l'écran : à position fixe
  // (haut-droite), elle recouvrait les contrôles sur tablette et pliable.
  const tipX = hover ? Math.min(Math.max(12, hover.x - 90), Math.max(12, window.innerWidth - 220)) : 0;
  const tipY = hover ? Math.min(Math.max(12, hover.y - 54), Math.max(12, window.innerHeight - 52)) : 0;

  return (
    <>
      <Canvas
        key={glKey}
        // `preserveDrawingBuffer` et l'antialiasing de contexte sont inutiles
        // ici (le composer gère l'anticrénelage) et coûtaient une copie par image.
        camera={{ position: [0, 120, 820], fov: 30, near: 1, far: 10000 }}
        dpr={dpr}
gl={{ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }}
        // Un tap dans le vide referme l'infobulle (indispensable au
        // tactile : `pointerout` n'y est pas fiable).
        onPointerMissed={() => setHover(null)}
        /**
         * Perte de contexte WebGL : c'est la cause du globe **blanc**.
         *
         * Chrome peut révoquer le contexte à tout moment (mémoire GPU,
         * onglet en arrière-plan, changement d'écran). Le canvas reste alors
         * affiché en blanc, indéfiniment, et seule une rechargement le
         * réparait. `webglcontextrestored` ne suffisait pas : Chrome ne
         * restaure pas toujours, et l'événement n'arrive jamais dans ce cas.
         *
         * On reconstruit donc la scène dès la **perte** : `preventDefault`
         * autorise la restauration, on masque le canvas pour éviter le flash,
         * puis on change la clé — React démonte et remonte un canvas neuf avec
         * un contexte neuf. Deux tentatives espacées couvrent le cas où le GPU
         * n'est pas encore prêt.
         */
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          const onLost = (event: Event) => {
            event.preventDefault();
            canvas.style.visibility = 'hidden';
            recomputeKey();
          };
          canvas.addEventListener('webglcontextlost', onLost, false);
          // Contexte stable : on réarme le compteur, pour continuer à
          // récupérer lors d'une perte ultérieure (session longue).
          window.setTimeout(() => {
            lostRef.current = 0;
          }, 5000);
        }}
      >
        <color attach="background" args={[props.look.background]} />
        <PerfReporter onSample={onSample} />
        <Scene
          {...props}
          world={world}
          onHover={(hop, at) => setHover(hop && at ? { hop, x: at.x, y: at.y } : null)}
          selected={props.selected}
          onCable={props.onCable}
          hoveredCable={cableHover ? cableHover.name : null}
          onCableHover={(name, at) =>
            setCableHover(name && at ? { name, x: at.x, y: at.y } : null)
          }
        />
        {bloomOn && <BloomLayer intensity={intensity} />}
      </Canvas>

      {/* Nom du câble survolé, près du curseur : on sait sur quoi on est. */}
      {cableHover && (
        <div
          className="globe-tip cable"
          style={{
            left: Math.min(Math.max(12, cableHover.x + 14), Math.max(12, window.innerWidth - 220)),
            top: Math.min(Math.max(12, cableHover.y - 34), Math.max(12, window.innerHeight - 40)),
          }}
        >
          <strong>{cableHover.name}</strong>
        </div>
      )}

      {hover && (
        <div
          className="globe-tip"
          style={{ left: tipX, top: tipY }}
        >
            <span className="num">#{hover.hop.ttl}</span>
            <img src={`/flags/${(hover.hop.country ?? 'xx').toLowerCase()}.svg`} alt="" />
            <strong>{hover.hop.city ?? '—'}</strong>
            <span className="cc">({hover.hop.country ?? '—'})</span>
            <span className="ms">{hover.hop.rttMs} ms</span>
        </div>
      )}
    </>
  );
}
