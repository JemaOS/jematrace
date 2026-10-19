import { useEffect } from 'react';

import { useCableInfo, useCableShape } from './cableMeta';
import { useT } from './i18n';
import { cablePalette } from './looks';

/**
 * Fiche d'un câble sous-marin.
 *
 * Structure reprise de la carte de référence : en-tête avec le nom et un badge
 * d'état, puis des sections « Aperçu », « Spécifications », « Points
 * d'atterrissage », « Propriétaires » et « Liens ».
 *
 * Les points d'atterrissage sont cliquables : ils ramènent la carte sur la
 * ville concernée. Tous les libellés passent par l'i18n (FR par défaut).
 */
export function CableModal({
  name,
  year,
  onClose,
  onLanding,
}: {
  name: string;
  /** Année affichée par la frise : sert au badge « Nouveau câble ». */
  year: number;
  onClose: () => void;
  /** Centre la carte sur un atterrissage. */
  onLanding?: (lat: number, lon: number) => void;
}) {
  const { t } = useT();
  const { info, ready } = useCableInfo(name);
  const shape = useCableShape(name);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const retired = info ? info.end !== null && info.end <= year : false;
  const isNew = info ? !retired && info.year === year : false;
  /** Couleur de l'aperçu : celle de l'état du câble sur la carte. */
  const shapeColor = cablePalette(false)[
    retired ? 'decommissioned' : isNew ? 'isNew' : 'regular'
  ].color;
  /** Technologie : fournie par la source, sinon déduite de l'année. */
  const technology = ((): string | null => {
    if (!info) return null;
    const raw = info.technology?.toLowerCase();
    if (raw === 'fiber-optic') return t('cable.techFiber');
    if (raw === 'coax' || raw === 'submarine-coaxial') return t('cable.techCoax');
    if (raw === 'telegraph') return t('cable.techTelegraph');
    // Repli historique : fibre depuis TAT-8 (1988), cuivre avant.
    return info.year >= 1988 ? t('cable.techFiber') : t('cable.techCoax');
  })();

  const owners = info?.owners
    ? info.owners
        .split(/\s*,\s*|\s+and\s+|\s+et\s+/i)
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="modal cable-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cable-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="cable-title">
            <i className="cable-dot" aria-hidden="true" />
            {info?.name ?? name}
            {retired && <span className="badge badge-decom">{t('cable.decommissioned')}</span>}
            {isNew && <span className="badge badge-new">{t('cable.newCable')}</span>}
          </h3>
          <button className="x" onClick={onClose} aria-label={t('cable.close')}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {!ready && <p className="cable-loading">…</p>}
          {ready && !info && <p className="cable-unknown">{t('cable.unknown')}</p>}

          {info && (
            <>
              {/* Vignette du tracé : on reconnaît le câble d'un coup d'œil. */}
              {shape && (
                <div className={`detail-cable-shape${isNew ? ' is-new' : ''}${retired ? ' is-decom' : ''}`}>
                  <svg viewBox="0 0 120 60" role="img" aria-label={info.name}>
                    <path d={shape} fill="none" stroke={shapeColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {info.description && (
                <section className="detail-section">
                  <div className="detail-section-title">{t('cable.overview')}</div>
                  <p className="detail-description">{info.description}</p>
                </section>
              )}

              <section className="detail-section">
                <div className="detail-section-title">{t('cable.specs')}</div>
                <div className="detail-meta-list">
                  <div className="detail-meta-row">
                    <span className="meta-label">{t('cable.rfsYear')}</span>
                    <span className="meta-value">{info.rfs ?? info.year}</span>
                  </div>
                  {info.end !== null && (
                    <div className="detail-meta-row">
                      <span className="meta-label">{t('cable.decommissionedYear')}</span>
                      <span className="meta-value highlight-decom">{info.end}</span>
                    </div>
                  )}
                  {info.length && (
                    <div className="detail-meta-row">
                      <span className="meta-label">{t('cable.length')}</span>
                      <span className="meta-value">{info.length}</span>
                    </div>
                  )}
                  {info.capacity && (
                    <div className="detail-meta-row">
                      <span className="meta-label">{t('cable.capacity')}</span>
                      <span className="meta-value">{info.capacity}</span>
                    </div>
                  )}
                  {technology && (
                    <div className="detail-meta-row">
                      <span className="meta-label">{t('cable.technology')}</span>
                      <span className="meta-value">{technology}</span>
                    </div>
                  )}
                </div>
              </section>

              {info.landingPoints.length > 0 && (
                <section className="detail-section">
                  <div className="detail-section-title">
                    {t('cable.landings')} ({info.landingPoints.length})
                  </div>
                  <div className="detail-pill-cloud">
                    {info.landingPoints.map((lp) => {
                      const canGo = onLanding && lp.lat !== null && lp.lon !== null;
                      return (
                        <button
                          key={`${lp.name}-${lp.country ?? ''}`}
                          type="button"
                          className="detail-pill"
                          disabled={!canGo}
                          title={lp.country ?? undefined}
                          onClick={() => {
                            if (canGo) onLanding!(lp.lat!, lp.lon!);
                          }}
                        >
                          {lp.name}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {owners.length > 0 && (
                <section className="detail-section">
                  <div className="detail-section-title">{t('cable.owners')}</div>
                  <div className="detail-owner-list">
                    {owners.slice(0, 6).map((owner) => (
                      <span className="owner-tag" key={owner}>
                        {owner}
                      </span>
                    ))}
                    {owners.length > 6 && (
                      <span className="owner-tag owner-more">
                        +{owners.length - 6} {t('cable.more')}
                      </span>
                    )}
                  </div>
                </section>
              )}

              {info.url && (
                <section className="detail-section">
                  <div className="detail-section-title">{t('cable.links')}</div>
                  <div className="detail-links-flex">
                    <a href={info.url} target="_blank" rel="noopener noreferrer" className="detail-link-btn">
                      {new URL(info.url).hostname.replace(/^www\./, '')} ↗
                    </a>
                  </div>
                </section>
              )}

              <p className="cable-source">{t('cable.source')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}