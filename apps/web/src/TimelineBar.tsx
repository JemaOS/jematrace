import { useT } from './i18n';
import type { TimelineState } from './timeline';

/**
 * Barre de lecture de l'histoire du réseau sous-marin.
 *
 * Même principe que la carte de référence : une pastille centrée en bas, avec
 * début / précédent / lecture / suivant / fin et l'année courante. Les câbles
 * mis en service après cette année ne sont pas dessinés, sur le globe comme
 * sur la carte 2D.
 */
export function TimelineBar({ timeline }: { timeline: TimelineState }) {
  const { t } = useT();
  if (!timeline.ready) return null;

  const { year, min, max, playing, atEnd } = timeline;
  const progress = max > min ? ((year - min) / (max - min)) * 100 : 100;

  return (
    <div className="timeline" role="group" aria-label={t('timeline.label')}>
      <div className="timeline-track" aria-hidden="true">
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

        <output className={atEnd ? 'tl-year end' : 'tl-year'} aria-live="polite">
          {year}
        </output>
      </div>
    </div>
  );
}