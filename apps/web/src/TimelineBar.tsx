import { useEffect, useRef, useState } from 'react';

import { useT } from './i18n';
import { useYearSummary, type TimelineState } from './timeline';

/**
 * Barre de lecture de l'histoire du réseau sous-marin.
 *
 * Elle se comporte comme un lecteur vidéo :
 *  - le filet de progression est **cliquable et glissable** : on saute
 *    directement à l'année correspondant à la position du curseur ;
 *  - l'année affichée est **éditable** : un clic ouvre un champ où l'on saisit
 *    l'année voulue.
 *
 * Les câbles mis en service après cette année ne sont pas dessinés, sur le
 * globe comme sur la carte 2D.
 */
export function TimelineBar({ timeline }: { timeline: TimelineState }) {
  const { t, lang } = useT();
  const story = useYearSummary(timeline.year);
  /**
   * Les récits annuels viennent de la source, en anglais : on ne les affiche
   * que dans l'interface anglaise. En français, mieux vaut pas de récit qu'un
   * paragraphe anglais au milieu de l'interface traduite.
   */
  const summary = lang === 'en' ? story : null;

  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const { year, min, max, playing, atEnd } = timeline;

  /** Année correspondant à une position horizontale sur le filet. */
  const yearAt = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || max <= min) return year;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(min + ratio * (max - min));
  };

  // Glissement : tant que le pointeur est enfoncé, l'année suit le curseur.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => timeline.setYear(yearAt(e.clientX));
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // `yearAt` ne dépend que de min/max, stables pendant un glissement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, min, max]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const openEditor = () => {
    setDraft(String(year));
    setEditing(true);
  };

  const commit = () => {
    const value = Number.parseInt(draft, 10);
    setEditing(false);
    if (Number.isFinite(value)) {
      timeline.setYear(Math.min(max, Math.max(min, value)));
    }
  };

  if (!timeline.ready) return null;

  const progress = max > min ? ((year - min) / (max - min)) * 100 : 100;

  return (
    <div className="timeline-stack">
      {/* Récit de l'année : même principe que la carte de référence. */}
      {summary && <p className="timeline-story">{summary}</p>}

      <div className="timeline" role="group" aria-label={t('timeline.label')}>
        {/* Filet de progression : cliquer ou glisser saute à l'année visée. */}
        <div
          ref={trackRef}
          className={dragging ? 'timeline-track dragging' : 'timeline-track'}
          role="slider"
          tabIndex={0}
          aria-label={t('timeline.seek')}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={year}
          // Position de la poignée, lue par le CSS (`::after`).
          style={{ ['--seek' as string]: `${progress}%` }}
          onPointerDown={(e) => {
            e.preventDefault();
            timeline.setYear(yearAt(e.clientX));
            setDragging(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') timeline.step(-1);
            if (e.key === 'ArrowRight') timeline.step(1);
            if (e.key === 'Home') timeline.first();
            if (e.key === 'End') timeline.last();
          }}
        >
          <span className="timeline-progress" style={{ width: `${progress}%` }} />
        </div>

        <div className="timeline-row">
          <button className="tl-btn" onClick={timeline.first} title={t('timeline.first')} aria-label={t('timeline.first')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 5v14M19 5l-9 7 9 7z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>

          <button className="tl-btn" onClick={() => timeline.step(-1)} title={t('timeline.prev')} aria-label={t('timeline.prev')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M16 5l-9 7 9 7z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            className={playing ? 'tl-play on' : 'tl-play'}
            onClick={timeline.toggle}
            title={playing ? t('timeline.pause') : t('timeline.play')}
            aria-label={playing ? t('timeline.pause') : t('timeline.play')}
            aria-pressed={playing}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <rect x="7" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
                <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M8 5.2v13.6L19 12z" fill="currentColor" />
              </svg>
            )}
          </button>

          {/* Vitesse de lecture : 1× ↔ 2×, comme un lecteur vidéo. */}
          <button
            className={timeline.speed > 1 ? 'tl-speed on' : 'tl-speed'}
            onClick={timeline.toggleSpeed}
            title={t('timeline.speed')}
            aria-label={t('timeline.speed')}
          >
            {timeline.speed}×
          </button>

          <button className="tl-btn" onClick={() => timeline.step(1)} title={t('timeline.next')} aria-label={t('timeline.next')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M8 5l9 7-9 7z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>

          <button className="tl-btn" onClick={timeline.last} title={t('timeline.last')} aria-label={t('timeline.last')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M18 5v14M5 5l9 7-9 7z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>

          {editing ? (
            <input
              ref={inputRef}
              className="tl-year-input"
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              value={draft}
              aria-label={t('timeline.editYear')}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <button
              className={atEnd ? 'tl-year end' : 'tl-year'}
              onClick={openEditor}
              title={t('timeline.editYear')}
            >
              {year}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}