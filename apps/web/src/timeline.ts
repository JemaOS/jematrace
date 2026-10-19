import { useCallback, useEffect, useRef, useState } from 'react';

import { loadCableMeta } from './cableMeta';

/**
 * Frise chronologique des câbles sous-marins.
 *
 * Chaque câble a une année de mise en service (`rfs_year` dans les fiches
 * TeleGeography). On peut donc rejouer la construction du réseau : à l'année N,
 * seuls les câbles mis en service jusqu'à N sont dessinés.
 *
 * Les quelques câbles sans année connue sont considérés comme toujours
 * présents : les masquer ferait disparaître des liaisons actives.
 */

export interface CableTimeline {
  /** Nom du câble → année de mise en service. */
  years: Map<string, number>;
  /** Première année représentée dans le jeu de données. */
  min: number;
  /** Dernière année affichable : l'année courante. */
  max: number;
}

let cache: CableTimeline | null = null;
let loading: Promise<CableTimeline> | null = null;

export function loadCableTimeline(): Promise<CableTimeline> {
  if (cache) return Promise.resolve(cache);
  loading ??= loadCableMeta().then((all) => {
    const years = new Map<string, number>();
    let min = Number.POSITIVE_INFINITY;
    let max = 0;

    for (const [name, info] of Object.entries(all)) {
      if (!info.year || info.year < 1800) continue;
      years.set(name, info.year);
      min = Math.min(min, info.year);
      max = Math.max(max, info.year);
    }

    const now = new Date().getFullYear();
    const timeline: CableTimeline = {
      years,
      min: Number.isFinite(min) ? min : 1858,
      // Les câbles « prévus » (2027+) ne doivent pas apparaître avant l'heure.
      max: Math.min(now, max || now),
    };
    cache = timeline;
    return timeline;
  });
  return loading;
}

/** Charge la frise une fois et la renvoie (`null` tant qu'elle n'est pas prête). */
export function useCableTimeline(): CableTimeline | null {
  const [timeline, setTimeline] = useState<CableTimeline | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadCableTimeline().then((loaded) => {
      if (alive) setTimeline(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);
  return timeline;
}

/** Année d'un câble : son `rfsYear`, ou `min` s'il est inconnu (donc toujours visible). */
export function yearOf(timeline: CableTimeline | null, name: string): number {
  if (!timeline) return 0;
  return timeline.years.get(name) ?? timeline.min;
}

export interface TimelineState {
  year: number;
  min: number;
  max: number;
  playing: boolean;
  ready: boolean;
  /** Vrai quand on est sur l'année courante : le réseau est complet. */
  atEnd: boolean;
  setYear: (year: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  step: (years: number) => void;
  first: () => void;
  last: () => void;
}

/** Intervalle entre deux années pendant la lecture (ms). */
const FRAME_MS = 400;

export function useTimeline(): TimelineState {
  const [timeline, setTimeline] = useState<CableTimeline | null>(cache);
  const [year, setYearState] = useState<number>(cache?.max ?? 0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void loadCableTimeline().then((t) => {
      if (!alive) return;
      setTimeline(t);
      // Premier chargement : on affiche le réseau complet.
      setYearState((current) => (current === 0 ? t.max : Math.min(current, t.max)));
    });
    return () => {
      alive = false;
    };
  }, []);

  const stop = useCallback(() => {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    setPlaying(false);
  }, []);

  const setYear = useCallback(
    (next: number) => {
      stop();
      setYearState(Math.round(next));
    },
    [stop],
  );

  // Lecture : une année par intervalle, arrêt automatique à la fin.
  useEffect(() => {
    if (!playing || !timeline) return;
    if (year >= timeline.max) {
      setPlaying(false);
      return;
    }
    const id = window.setInterval(() => {
      setYearState((current) => {
        if (current >= timeline.max) {
          setPlaying(false);
          return timeline.max;
        }
        return current + 1;
      });
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, timeline, year]);

  const play = useCallback(() => {
    if (!timeline) return;
    // Relancer depuis le début quand on est déjà à la fin.
    setYearState((current) => (current >= timeline.max ? timeline.min : current));
    setPlaying(true);
  }, [timeline]);

  const step = useCallback(
    (years: number) => {
      if (!timeline) return;
      stop();
      setYearState((current) => Math.min(timeline.max, Math.max(timeline.min, current + years)));
    },
    [stop, timeline],
  );

  const first = useCallback(() => {
    if (!timeline) return;
    stop();
    setYearState(timeline.min);
  }, [stop, timeline]);

  const last = useCallback(() => {
    if (!timeline) return;
    stop();
    setYearState(timeline.max);
  }, [stop, timeline]);

  useEffect(() => () => stop(), [stop]);

  return {
    year,
    min: timeline?.min ?? 0,
    max: timeline?.max ?? 0,
    playing,
    ready: timeline !== null,
    atEnd: timeline ? year >= timeline.max : true,
    setYear,
    play,
    pause: stop,
    toggle: () => (playing ? stop() : play()),
    step,
    first,
    last,
  };
}
/* ------------------------------------------------------------- récits annuels */

export type YearSummaries = Record<string, { description?: string }>;

let summariesCache: YearSummaries | null = null;
let summariesLoading: Promise<YearSummaries> | null = null;

/** Récits année par année (61 années documentées, de 1858 à aujourd'hui). */
export function loadYearSummaries(): Promise<YearSummaries> {
  if (summariesCache) return Promise.resolve(summariesCache);
  summariesLoading ??= fetch('/world/year-summaries.json')
    .then(async (res) => (res.ok ? ((await res.json()) as YearSummaries) : {}))
    .catch(() => ({}))
    .then((data) => {
      summariesCache = data;
      return data;
    });
  return summariesLoading;
}

/** Récit de l'année courante, ou `null`. */
export function useYearSummary(year: number): string | null {
  const [summaries, setSummaries] = useState<YearSummaries | null>(summariesCache);
  useEffect(() => {
    let alive = true;
    void loadYearSummaries().then((data) => {
      if (alive) setSummaries(data);
    });
    return () => {
      alive = false;
    };
  }, []);
  return summaries?.[String(year)]?.description ?? null;
}
