import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { InspectHop } from './api';
import type { Basemap, Look } from './looks';
import type { YearFocus } from './timeline';
import { loadWorld, type WorldData } from './world';

/**
 * Carte 2D : Leaflet, marqueurs numérotés, câbles avec nom au survol et
 * bandeau d'information.
 *
 * Le fond suit l'apparence choisie (`look.basemap`) : tuiles cartographiques
 * filtrées, lumières nocturnes réelles, lumières superposées au mode
 * Jour/Nuit, et frontières internes sur les variantes « + Frontières ».
 */

const PLAN_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const PLAN_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Black Marble (VIIRS City Lights 2012), NASA GIBS, domaine public. */
const NIGHT_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
const NIGHT_ATTRIB =
  'Lumières nocturnes : <a href="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs">NASA GIBS</a> / Black Marble (VIIRS, Suomi NPP)';
/** GIBS ne fabrique pas de tuiles au-delà du niveau 8 : Leaflet agrandit. */
const NIGHT_MAX_NATIVE_ZOOM = 8;

/** Limite du monde en Mercator : aucun fournisseur n'a de tuile au-delà. */
const WORLD_BOUNDS: L.LatLngBoundsExpression = [
  [-85.0511, -180],
  [85.0511, 180],
];

/** Panneaux, du fond vers le dessus. */
const LIGHTS_PANE = 'lightsPane';
const BORDER_PANE = 'borderPane';
const CABLE_PANE = 'cablePane';

const DEG = Math.PI / 180;

/**
 * Leaflet 1.9 programme parfois un redessin canevas pendant la destruction de la
 * carte (double montage en développement, bascule 2D/3D) : `_clear` tombe alors
 * sur un contexte déjà supprimé. On neutralise ce cas, sans effet visible.
 */
let canvasGuarded = false;
function guardCanvasTeardown(): void {
  if (canvasGuarded) return;
  canvasGuarded = true;
  const proto = L.Canvas.prototype as unknown as {
    _ctx?: CanvasRenderingContext2D;
    _clear: () => void;
    _draw: () => void;
  };
  const clear = proto._clear;
  const draw = proto._draw;
  proto._clear = function (this: typeof proto) {
    if (!this._ctx) return;
    clear.call(this);
  };
  proto._draw = function (this: typeof proto) {
    if (!this._ctx) return;
    draw.call(this);
  };
}

function greatCircle(from: [number, number], to: [number, number], steps = 48): Array<[number, number]> {
  const [lat1, lon1] = [from[0] * DEG, from[1] * DEG];
  const [lat2, lon2] = [to[0] * DEG, to[1] * DEG];
  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
    ),
  );
  if (d === 0) return [from, to];

  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = Math.sin((1 - t) * d) / Math.sin(d);
    const b = Math.sin(t * d) / Math.sin(d);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    out.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG, Math.atan2(y, x) / DEG]);
  }
  return out;
}

/** Découpe une polyligne aux passages de l'antiméridien. */
function splitAtAntimeridian(points: Array<[number, number]>): Array<Array<[number, number]>> {
  const segments: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];

  for (const [lon, lat] of points) {
    if (current.length > 0) {
      const prev = current[current.length - 1]!;
      if (Math.abs(lon - prev[0]) > 180) {
        const endEdge = lon < prev[0] ? 180 : -180;
        current.push([endEdge, prev[1]]);
        segments.push(current);
        current = [[-endEdge, lat]];
      }
    }
    current.push([lon, lat]);
  }

  if (current.length > 1) segments.push(current);
  return segments;
}

/**
 * Tracés à dessiner pour une étape : la polyligne de câble fournie par le
 * serveur (mode Topo) ou, à défaut, le grand cercle.
 */
function segmentPaths(from: InspectHop, to: InspectHop): Array<Array<[number, number]>> {
  if (to.polyline && to.polyline.length > 1) {
    const lonLat = to.polyline.map(([lat, lon]) => [lon, lat] as [number, number]);
    return splitAtAntimeridian(lonLat)
      .filter((segment) => segment.length > 1)
      .map((segment) => segment.map(([lon, lat]) => [lat, lon] as [number, number]));
  }
  return [greatCircle([from.lat!, from.lon!], [to.lat!, to.lon!])];
}

/**
 * Câbles sous-marins : deux traits larges sous le trait net donnent le halo
 * des apparences nocturnes. Le nom s'affiche au survol du trait net, avec la
 * tolérance du moteur de rendu (le réseau compte ~1 900 câbles : il est dessiné
 * sur un canevas, pas en SVG, pour rester fluide).
 */
function createCable(
  path: Array<[number, number]>,
  name: string,
  cable: Basemap['cable'],
  renderer: L.Canvas,
  onSelect?: (name: string) => void,
): L.Layer[] {
  const base = { pane: CABLE_PANE, renderer, interactive: false as const, smoothFactor: 1.6 };
  const layers: L.Layer[] = [];

  if (cable.glow) {
    layers.push(L.polyline(path, { ...base, color: cable.glow, weight: cable.weight * 5, opacity: 0.12 }));
    layers.push(L.polyline(path, { ...base, color: cable.glow, weight: cable.weight * 2.5, opacity: 0.24 }));
  }

  const line = L.polyline(path, {
    pane: CABLE_PANE,
    renderer,
    smoothFactor: 1.6,
    color: cable.color,
    weight: cable.weight,
    opacity: cable.glow ? 0.92 : 0.62,
  }).bindTooltip(name, { className: 'cable-tooltip', sticky: true });

  if (onSelect) {
    line.on('click', () => onSelect(name));
    // Curseur « main » sur le tracé. Le canevas est le conteneur du moteur de
    // rendu ; `getPane()` renvoie la zone où il est monté.
    line.on('mouseover', () => {
      const pane = renderer.getPane?.();
      if (pane) pane.style.cursor = 'pointer';
    });
    line.on('mouseout', () => {
      const pane = renderer.getPane?.();
      if (pane) pane.style.cursor = '';
    });
  }

  layers.push(line);
  return layers;
}

/** Marqueur numéroté, aux couleurs et tailles du site. */
function makeIcon(index: number, isFirst: boolean, isLast: boolean): L.DivIcon {
  const color = isFirst ? '#ffff00' : isLast ? '#5b5bf0' : '#f85149';
  const size = isFirst || isLast ? 12 : 9;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 2 + 6}" height="${size * 2 + 6}">
    <circle cx="${size + 3}" cy="${size + 3}" r="${size}" fill="${color}" fill-opacity="0.85" stroke="#0d1117" stroke-width="1.5"/>
    <text x="${size + 3}" y="${size + 6}" text-anchor="middle" font-size="${size < 10 ? 8 : 10}" font-family="monospace" fill="#0d1117" font-weight="bold">${index + 1}</text>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size * 2 + 6, size * 2 + 6],
    iconAnchor: [size + 3, size + 3],
  });
}

interface CableFile {
  minYear?: number;
  maxYear?: number;
  cables?: Array<{
    name: string;
    year: number;
    end: number | null;
    lines: Array<Array<[number, number]>>;
  }>;
  landings?: Array<{ lat: number; lon: number }>;
}

export function Map2D({
  hops,
  showCables,
  look,
  onCable,
  year,
  focus,
}: {
  hops: InspectHop[];
  showCables: boolean;
  look: Look;
  /** Ouvre la fiche d'un câble au clic sur son tracé. */
  onCable?: (name: string) => void;
  /** Année de la frise : seuls les câbles mis en service jusque-là sont visibles. */
  year: number;
  /** Câbles de l'année : la carte vole vers leur emprise. */
  focus?: YearFocus | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const lightsRef = useRef<L.TileLayer | null>(null);
  const layerRef = useRef<L.FeatureGroup | null>(null);
  const cableRef = useRef<L.FeatureGroup | null>(null);
  const cableRendererRef = useRef<L.Canvas | null>(null);
  const borderGroupRef = useRef<L.FeatureGroup | null>(null);
  const borderRendererRef = useRef<L.Canvas | null>(null);
  const cableDataRef = useRef<CableFile | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const fitToRouteRef = useRef<(() => void) | null>(null);
  /** Lots de câbles par année, et nombre de lots actuellement posés. */
  const batchesRef = useRef<Array<[number, L.Layer[]]>>([]);
  const displayedRef = useRef(0);
  const applyYearRef = useRef<(() => void) | null>(null);
  /**
   * Un câble est visible entre sa mise en service et son retrait. On garde donc
   * la liste complète avec ses bornes : changer d'année n'ajoute ou ne retire
   * que les câbles dont l'état change (les deltas), sans rien reconstruire.
   */
  const cablesRef = useRef<
    Array<{ year: number; end: number | null; layers: L.Layer[]; visible: boolean }>
  >([]);
  const [toast, setToast] = useState(true);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    guardCanvasTeardown();
    const map = L.map(hostRef.current, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 10,
      // Interdit de sortir du monde en 2D.
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
      // Tout en canevas : moins de nœuds DOM, pas de re-projection SVG au zoom.
      preferCanvas: true,
      // Molette plus douce, et on anime les sauts de zoom jusqu'à 6 niveaux.
      wheelPxPerZoomLevel: 100,
      wheelDebounceTime: 40,
      zoomAnimationThreshold: 6,
    }).setView([30, -20], 2);

    /**
     * Cadre le trace. On le rejoue après chaque changement de taille : au
     * premier passage, le conteneur peut ne pas encore avoir sa taille, et
     * itBounds retombait alors sur le zoom minimal (globe entier, trace
     * minuscule au centre).
     */
    const fitToRoute = () => {
      const bounds = boundsRef.current;
      if (!bounds?.isValid()) return;
      const host = hostRef.current;
      if (!host || host.clientWidth < 40 || host.clientHeight < 40) return;
      const wide = host.clientWidth > 680;
      map.fitBounds(bounds, {
        paddingTopLeft: wide ? [330, 40] : [24, 56],
        paddingBottomRight: wide ? [40, 60] : [24, 150],
        animate: false,
      });
    };
    fitToRouteRef.current = fitToRoute;

    map.createPane(LIGHTS_PANE).style.zIndex = '250';
    map.createPane(BORDER_PANE).style.zIndex = '320';
    map.createPane(CABLE_PANE).style.zIndex = '350';

    cableRef.current = L.featureGroup().addTo(map);
    // Le réseau de câbles est dessiné sur un canevas : des milliers de traits
    // en SVG rendraient le zoom et le rendu trop lents.
    cableRendererRef.current = L.canvas({ pane: CABLE_PANE, tolerance: 6, padding: 0.15 });
    layerRef.current = L.featureGroup().addTo(map);
    mapRef.current = map;

    // Le monde doit couvrir la largeur : sinon des bandes vides apparaissent
    // de chaque côté sur les grands ecrans.
    const fitMinZoom = () => {
      const width = hostRef.current?.clientWidth ?? 0;
      const zoom = Math.min(5, Math.max(2, Math.ceil(Math.log2(Math.max(width, 1) / 256))));
      map.setMinZoom(zoom);
      if (map.getZoom() < zoom) map.setZoom(zoom);
    };

    /**
     * Quand la zone change de taille (volet replié, rotation de l'écran,
     * passage en 2D sur mobile), Leaflet garde sa taille interne : les tuiles
     * s'arrêtent au milieu et la carte n'occupe plus tout l'espace. Il faut le
     * lui dire explicitement.
     */
    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        fitMinZoom();
        map.invalidateSize({ animate: false, pan: false });
        fitToRouteRef.current?.();
      });
    };

    fitMinZoom();
    const observer = new ResizeObserver(onResize);
    observer.observe(hostRef.current!);
    window.addEventListener('orientationchange', onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', onResize);
      if (frame) cancelAnimationFrame(frame);
      // Vider les groupes AVANT de détruire la carte : sinon Leaflet retire le
      // moteur canevas avant ses tracés, et ceux-ci programment un redessin sur
      // un contexte déjà détruit (`clearRect` sur undefined).
      layerRef.current?.clearLayers();
      cableRef.current?.clearLayers();
      borderGroupRef.current?.clearLayers();
      map.stop();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      lightsRef.current = null;
      layerRef.current = null;
      cableRef.current = null;
      cableRendererRef.current = null;
      borderGroupRef.current = null;
      borderRendererRef.current = null;
    };
  }, []);

  // Fond de carte : change avec l'apparence (couleurs, filtres, frontières).
  useEffect(() => {
    const map = mapRef.current;
    const host = hostRef.current;
    if (!map || !host) return;

    host.style.setProperty('--map2d-bg', look.basemap.background);

    const pane = map.getPane('tilePane');
    if (pane) pane.style.filter = look.basemap.filter;

    tileRef.current?.remove();
    lightsRef.current?.remove();

    const attribution = [look.basemap.source === 'plan' ? PLAN_ATTRIB : NIGHT_ATTRIB];
    if (look.basemap.lights !== undefined && look.basemap.source === 'plan') attribution.push(NIGHT_ATTRIB);

    const layer = look.basemap.source === 'nights'
      ? L.tileLayer(NIGHT_URL, {
          attribution: attribution.join(' | '),
          bounds: WORLD_BOUNDS,
          maxZoom: 10,
          maxNativeZoom: NIGHT_MAX_NATIVE_ZOOM,
          noWrap: true,
          keepBuffer: 3,
        })
      : L.tileLayer(PLAN_URL, {
          attribution: attribution.join(' | '),
          bounds: WORLD_BOUNDS,
          maxZoom: 19,
          noWrap: true,
          keepBuffer: 3,
        });
    layer.addTo(map);
    layer.bringToBack();
    tileRef.current = layer;

    // Mode Jour/Nuit : les lumières des villes sont posées sur la carte.
    if (look.basemap.lights !== undefined) {
      const lights = L.tileLayer(NIGHT_URL, {
        bounds: WORLD_BOUNDS,
        maxZoom: 10,
        maxNativeZoom: NIGHT_MAX_NATIVE_ZOOM,
        noWrap: true,
        keepBuffer: 3,
        pane: LIGHTS_PANE,
        opacity: look.basemap.lights,
      });
      lights.addTo(map);
      lightsRef.current = lights;
    }
  }, [look]);

  // Frontières internes, pour les variantes « + Frontières ».
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const color = look.basemap.border;
    if (!color) {
      borderGroupRef.current?.clearLayers();
      return;
    }

    let alive = true;
    const renderer = borderRendererRef.current ?? L.canvas({ pane: BORDER_PANE });
    borderRendererRef.current = renderer;

    loadWorld()
      .then((world: WorldData) => {
        if (!alive || !mapRef.current) return;
        const group = borderGroupRef.current ?? L.featureGroup().addTo(map);
        borderGroupRef.current = group;

        group.clearLayers();
        // Toutes les frontières en une seule polyligne multi-parties : un seul
        // tracé canevas au lieu d'environ 200, donc un zoom bien plus fluide.
        const parts: Array<Array<[number, number]>> = [];
        for (const ring of world.countries) {
          const points = ring
            .filter((point) => point.length >= 2)
            .map(([lon, lat]) => [lon!, lat!] as [number, number]);
          for (const segment of splitAtAntimeridian(points)) {
            if (segment.length < 2) continue;
            parts.push(segment.map(([lon, lat]) => [lat, lon] as [number, number]));
          }
        }
        if (parts.length > 0) {
          L.polyline(parts, {
            color,
            weight: 0.8,
            opacity: 1,
            fill: false,
            interactive: false,
            pane: BORDER_PANE,
            renderer,
            smoothFactor: 1.2,
          }).addTo(group);
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [look]);

  // Câbles sous-marins : dessinés dans leur propre panneau, masqués en mode Topo.
  useEffect(() => {
    const map = mapRef.current;
    const group = cableRef.current;
    const renderer = cableRendererRef.current;
    if (!map || !group || !renderer) return;

    let alive = true;

    /**
    /**
     * Un câble est dessiné une fois, puis simplement ajouté ou retiré selon
     * l'année : on ne reconstruit jamais les 706 câbles pendant la lecture.
     * `visible` mémorise l'état pour ne toucher que les deltas.
     */
    const draw = (data: CableFile) => {
      if (!alive || !mapRef.current) return;
      group.clearLayers();

      const entries: typeof cablesRef.current = [];
      for (const cable of data.cables ?? []) {
        const layers: L.Layer[] = [];
        for (const line of cable.lines) {
          for (const segment of splitAtAntimeridian(line)) {
            if (segment.length < 2) continue;
            layers.push(
              ...createCable(
                segment.map(([lon, lat]) => [lat, lon] as [number, number]),
                cable.name,
                look.basemap.cable,
                renderer,
                onCable,
              ),
            );
          }
        }
        if (layers.length > 0) {
          entries.push({ year: cable.year, end: cable.end, layers, visible: false });
        }
      }

      cablesRef.current = entries;
      applyYearRef.current?.();
    };

    void (cableDataRef.current
      ? Promise.resolve(cableDataRef.current)
      : fetch('/world/cables.geo.json').then(async (res) =>
          res.ok ? ((await res.json()) as CableFile) : { cables: [], landings: [] },
        )
    )
      .then((data) => {
        cableDataRef.current = data;
        draw(data);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [look, onCable]);

  /**
   * Applique l'année courante : un câble est visible de sa mise en service à
   * son retrait (les câbles retirés — télégraphe du XIXe — disparaissent).
   */
  const applyYear = useCallback(() => {
    const group = cableRef.current;
    if (!group) return;

    for (const cable of cablesRef.current) {
      // `end >= year` : un câble retiré l'année même de sa mise en service
      // (le transatlantique de 1858, hors service en trois semaines) doit
      // apparaître pendant cette année-là.
      const want = cable.year <= year && (cable.end === null || cable.end >= year);
      if (want === cable.visible) continue;
      if (want) {
        for (const layer of cable.layers) (layer as L.Polyline).addTo(group);
      } else {
        for (const layer of cable.layers) group.removeLayer(layer);
      }
      cable.visible = want;
    }
  }, [year]);

  applyYearRef.current = applyYear;

  useEffect(() => {
    applyYear();
  }, [applyYear]);

  /**
   * Vol vers les câbles de l'année : la carte « atterrit » sur ce qui vient
   * d'être construit. On ne bouge qu'après une action de l'utilisateur sur la
   * frise (`navigated`), pour ne pas écraser le cadrage du traceroute à
   * l'ouverture ; et jamais quand le réseau est complet (`focus` = `null`).
   */
  const initialYear = useRef(year);
  const navigated = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (year !== initialYear.current) navigated.current = true;
    if (!navigated.current || !focus) return;
    const bounds = L.latLngBounds(
      [focus.south, focus.west],
      [focus.north, focus.east],
    );
    // Un câble qui traverse l'antiméridien donne une emprise de 360° : on vise
    // alors son centre, sinon la carte dézoomerait sur le monde entier.
    if (focus.east - focus.west > 180) {
      map.flyTo([focus.lat, focus.lon], 4, { duration: 1.4 });
      return;
    }
    map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 5, duration: 1.4, easeLinearity: 0.25 });
  }, [focus, year]);

  // Les câbles restent visibles dans les deux modes : en Topo, la route les
  // suit, et le réseau permet de voir par où elle passe.
  useEffect(() => {
    const map = mapRef.current;
    const pane = map?.getPane(CABLE_PANE);
    if (!pane) return;
    pane.style.visibility = showCables ? 'visible' : 'hidden';
  }, [showCables]);

  // Route : marqueurs numérotés + arcs en grand cercle.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    const halo = look.basemap.halo;

    layer.clearLayers();
    const all = hops.filter((h) => h.lat !== null && h.lon !== null);
    const located = all;
    if (located.length === 0) return;

    const latlngs: Array<[number, number]> = [];

    located.forEach((h, i) => {
      const isFirst = i === 0;
      const isLast = i === located.length - 1;
      const marker = L.marker([h.lat!, h.lon!], { icon: makeIcon(i, isFirst, isLast) }).addTo(layer);
      latlngs.push([h.lat!, h.lon!]);

      const popup = `
        <div class="popup-num">#${h.ttl}${h.asn ? ` · AS${h.asn}` : ''}</div>
        <div class="popup-label">${h.city ?? '—'}${h.country ? ` (${h.country})` : ''}</div>
        ${h.rttMs ? `<div class="popup-rtt">${h.rttMs} ms</div>` : ''}
        <div class="popup-coords">${h.lat!.toFixed(3)}, ${h.lon!.toFixed(3)}</div>
      `;
      marker.bindPopup(popup, { maxWidth: 220 });
      marker.on('mouseover', () => marker.openPopup());
      marker.on('mouseout', () => marker.closePopup());
    });

    if (located.length > 1) {
      // Tracé réel : segments colorés par vitesse. En mode Topo, le serveur
      // fournit la polyligne qui suit les câbles ; sinon, un grand cercle.
      for (let i = 1; i < located.length; i++) {
        const from = located[i - 1]!;
        const to = located[i]!;
        for (const path of segmentPaths(from, to)) {
          if (halo) {
            // Halo sous le trait : la route ressort sur les fonds sombres.
            L.polyline(path, { color: to.color, weight: 7, opacity: 0.12, interactive: false }).addTo(layer);
            L.polyline(path, { color: to.color, weight: 3.4, opacity: 0.22, interactive: false }).addTo(layer);
          }
          L.polyline(path, { color: to.color, weight: halo ? 2.2 : 2, opacity: 0.95 }).addTo(layer);
        }
      }
    }

    boundsRef.current = L.latLngBounds(latlngs);
    // Deux passes : la première avec la taille courante, la seconde une fois
    // la mise en page stabilisée (voir itToRoute).
    fitToRouteRef.current?.();
    requestAnimationFrame(() => fitToRouteRef.current?.());
    layer.bringToFront();
  }, [hops, look]);

  return (
    <>
      <div ref={hostRef} className="map2d" />
      {toast && (
        <div id="topo-toast">
          <b>Survolez un câble pour voir son nom.</b> Les sauts L3 (IP géolocalisées) sont
          exacts.
          <button id="topo-toast-close" onClick={() => setToast(false)} aria-label="Fermer">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
