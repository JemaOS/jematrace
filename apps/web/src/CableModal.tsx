import { useEffect } from 'react';

import { useCableInfo } from './cableMeta';
import { useT } from './i18n';

/**
 * Fiche d'un câble sous-marin.
 *
 * S'ouvre au clic sur un câble, depuis la carte 2D comme depuis le globe.
 * Présente les mêmes informations que la carte de référence : spécifications
 * (mise en service, longueur, capacité, propriétaires), points d'atterrissage
 * et lien officiel.
 *
 * Tous les libellés passent par l'i18n : français par défaut, anglais quand
 * l'utilisateur change de langue.
 */
export function CableModal({ name, onClose }: { name: string; onClose: () => void }) {
  const { t } = useT();
  const { info, ready } = useCableInfo(name);

  // Échap ferme la fiche, comme les autres fenêtres de l'application.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const now = new Date().getFullYear();
  const planned = info ? info.year > now : false;

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
              <div className="cable-badges">
                <span className={planned ? 'badge planned' : 'badge live'}>
                  {planned ? t('cable.planned') : t('cable.inService')}
                </span>
                {info.end !== null && info.end <= now && (
                  <span className="badge retired">
                    {t('cable.retiredIn')} {info.end}
                  </span>
                )}
              </div>

              {info.description && <p className="cable-intro">{info.description}</p>}

              <h4>{t('cable.specs')}</h4>
              <dl className="cable-facts">
                <dt>{t('cable.rfs')}</dt>
                <dd>{info.rfs ?? info.year}</dd>

                {info.length && (
                  <>
                    <dt>{t('cable.length')}</dt>
                    <dd>{info.length}</dd>
                  </>
                )}

                {info.capacity && (
                  <>
                    <dt>{t('cable.capacity')}</dt>
                    <dd>{info.capacity}</dd>
                  </>
                )}

                {info.owners && (
                  <>
                    <dt>{t('cable.owners')}</dt>
                    <dd>{info.owners}</dd>
                  </>
                )}

                {info.suppliers && (
                  <>
                    <dt>{t('cable.suppliers')}</dt>
                    <dd>{info.suppliers}</dd>
                  </>
                )}
              </dl>

              {info.landingPoints.length > 0 && (
                <>
                  <h4>
                    {t('cable.landings')} ({info.landingPoints.length})
                  </h4>
                  <ul className="cable-landings">
                    {info.landingPoints.map((lp) => (
                      <li key={`${lp.name}-${lp.country ?? ''}`}>
                        <span className="lp-name">{lp.name}</span>
                        {lp.country && <span className="lp-country">{lp.country}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="cable-foot">
                {info.url && (
                  <a href={info.url} target="_blank" rel="noopener noreferrer">
                    {t('cable.official')} ↗
                  </a>
                )}
                <span className="cable-source">{t('cable.source')}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}