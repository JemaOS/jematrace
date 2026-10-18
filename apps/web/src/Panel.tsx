import { useState } from 'react';

import type { TraceResult } from '@geotrace/shared';

import type { ClientPosition, InspectHop } from './api';
import { groupNumber } from './format';
import { useT } from './i18n';

export interface RecentEntry {
  target: string;
  at: number;
  /** Sortie brute conserv�e pour pouvoir la rejouer. */
  text?: string;
}

interface Props {
  result: TraceResult;
  hops: InspectHop[];
  /** Mode geek : déplie chaque ville sur ses sauts et affiche les km par segment. */
  geek: boolean;
  /** Avertissement d'analyse (ex. latences absentes après un copier-coller). */
  warning?: string;
  onReset: () => void;
  onShare: () => void;
  onCollapse: () => void;
  recent: RecentEntry[];
  /** Position de depart du visiteur, affichee en #0. */
  client?: ClientPosition | null;
  onPickRecent: (entry: RecentEntry) => void;
}

/** Panneau de gauche : groupes de villes, métriques, détail des sauts, récents. */
export function Panel({ result, hops, geek, warning, onReset, onShare, onCollapse, recent, onPickRecent, client }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(null);
  // Une liaison courte ou terrestre n'emprunte aucun câble : Topo et Ligne
  // produisent alors exactement le même tracé.
  const hasCableRoute = result.groups.some((g) => Boolean(g.polyline));
  const colorByTtl = new Map(hops.map((h) => [h.ttl, h.color]));

  return (
    <aside className="sidebar">
      <button className="collapse" onClick={onCollapse} aria-label="Afficher / masquer le panneau">
        <span className="chev" aria-hidden="true">
          ‹
        </span>
      </button>

      <div className="target-row">
        <div className="target">{result.target}</div>
        <button className="share" onClick={onShare} aria-label={t('panel.share')} title="Partager ce traceroute">
          ⧉
        </button>
      </div>

      {client && (
        <div className="client-row">
          <span className="idx">#0</span>
          <span className="dot" />
          <span className="city">{client.city ?? 'Votre position'}</span>
          <span className="ms">0 ms</span>
          <span className="client-ip">{client.ip}</span>
        </div>
      )}

      <div className="groups">
        {result.groups.map((g) => {
          const expanded = geek || open === g.i;
          return (
            <div key={g.i}>
              <div
                className="group"
                onClick={() => setOpen(open === g.i ? null : g.i)}
                role="button"
                tabIndex={0}
              >
                <span className="idx">#{g.i}</span>
                <img
                  className="flag"
                  src={`/flags/${(g.country ?? 'xx').toLowerCase()}.svg`}
                  alt={g.country ?? 'pays inconnu'}
                  loading="lazy"
                />
                <span className="cc">{g.country ?? '--'}</span>
                <span className="city">{g.city}</span>
                <span className="ms" style={{ color: colorByTtl.get(g.hops[0]!.ttl) ?? '#e6edf3' }}>
                  {g.rttMs} ms
                </span>
              </div>

              {geek && <div className="km">{g.kmFromPrev} km depuis la ville précédente</div>}

              {expanded && (
                <div className="ghops">
                  {g.hops.map((h) => (
                    <div className="ghop" key={`${h.ttl}-${h.ip}`}>
                      <span>{h.ip || '—'}</span>
                      <span className="as">[AS{h.asn ?? 0}]</span>
                      <span>{h.rttMs > 0 ? `${h.rttMs} ms` : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="metrics">
        <div>
          <b>{t('panel.ip')}</b> {result.destIp ?? '—'}
          {result.anycast ? ' (anycast)' : ''}
        </div>
        <div>
          <b>{t('panel.as')}</b> {hops.find((h) => h.ip === result.destIp)?.asName ?? '—'}
        </div>
        <div>
          <b>{t('panel.asPath')}</b> {result.asPath.join(' ') || '—'}
        </div>
        <div>
          <b>{t('panel.distance')}</b> {groupNumber(result.distanceKm)} km ({groupNumber(result.speedKmS)} km/s)
        </div>
        {/* Sur une liaison courte ou entièrement terrestre, aucun câble
            sous-marin n'est emprunté : les deux modes donnent le même tracé.
            Le dire évite de croire que le bouton Topo/Ligne ne fait rien. */}
        {warning && <div className="metrics-note">{warning}</div>}
        {!hasCableRoute && <div className="metrics-note">{t('panel.noCable')}</div>}
      </div>

      <div className="cta-wrap">
        <button className="primary cta" onClick={onReset}>
          {t('panel.another')}
        </button>
      </div>

      <div className="recent">
        <div className="recent-title">{t('panel.recent')}</div>
        {recent.length === 0 && <div className="recent-empty">Aucun pour l'instant.</div>}
        {recent.map((r) => (
          <div className="recent-row" key={`${r.target}-${r.at}`}>
            <button onClick={() => onPickRecent(r)} title={r.target}>
              <span className="dot">•</span>
              {r.target}
            </button>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <span className="muted" style={{ fontSize: 12 }}>
          {geek ? t('panel.geekOn') : t('panel.clickCity')}
        </span>
      </div>
    </aside>
  );
}
