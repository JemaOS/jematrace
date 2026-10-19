import { useEffect } from 'react';

import { useCableInfo } from './cableMeta';
import { useT } from './i18n';

/**
 * Fiche d'un câble sous-marin, ouverte au clic sur un câble de la carte 2D.
 *
 * Affiche ce que l'on sait de la liaison : longueur, propriétaires,
 * fournisseur, année de mise en service, points d'atterrissage, lien officiel.
 * Les informations viennent de TeleGeography (même source que le tracé).
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

  const planned = info?.rfsYear ? info.rfsYear > new Date().getFullYear() : false;

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
                {info.rfs && <span className="badge">{info.rfs}</span>}
              </div>

              <dl className="cable-facts">
                {info.length && (
                  <>
                    <dt>{t('cable.length')}</dt>
                    <dd>{info.length}</dd>
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
                  <h4>{t('cable.landings')}</h4>
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

              {info.notes && <p className="cable-notes">{info.notes}</p>}

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