import { useEffect, useState } from 'react';

import { useT } from './i18n';

/**
 * Écran d'analyse.
 *
 * Sur geotraceroute.com, la page attend une sonde distante (« Sonde :
 * Geo Traceroute », « ~18 s restantes »). RouteScope n'a pas de sonde : la
 * trace vient de la machine de l'utilisateur, et le travail est la
 * géolocalisation des sauts. On garde la même mise en page — spinner à gauche,
 * titre, origine, étapes — avec des informations qui correspondent vraiment à
 * ce qui se passe.
 */

/** Durée estimée de l'analyse, en secondes. */
const ESTIMATE_S = 8;

export function Loading({ target, source }: { target: string | null; source: string | null }) {
  const { t } = useT();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => window.clearInterval(id);
  }, []);

  const steps = [t('load.step1'), t('load.step2'), t('load.step3'), t('load.step4')];
  const step = elapsed < 1.2 ? 0 : elapsed < 3 ? 1 : elapsed < 5 ? 2 : 3;
  const left = Math.max(1, Math.ceil(ESTIMATE_S - elapsed));

  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />

      <div className="loading-body">
        <h2>{target ? t('load.toward').replace('{target}', target) : t('load.title')}</h2>

        <p className="loading-source">
          {source ? t('load.from').replace('{source}', source) : t('load.fromYou')}
        </p>
        <p className="loading-meta">{t('load.origin')}</p>
        <p className="loading-hint">{t('load.takesTime')}</p>

        <p className="loading-step">
          {steps[step]} · ~{left} s
        </p>
      </div>
    </div>
  );
}

/**
 * Cible devinée dans le texte collé, pour l'afficher pendant l'analyse.
 * Volontairement tolérant : les quatre formats et le rapport tabulaire.
 */
export function guessTarget(text: string): string | null {
  const patterns = [
    /(?:traceroute to|tracing route to|d[ée]termination de l['’]itin[ée]raire vers)\s+(\S+)/i,
    /Cible\s*:\s*(\S+)/i,
    /\btracepath\s+(\S+)/i,
    /\btrace\s*route\s+(\S+)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].replace(/[),.;]+$/, '');
  }
  return null;
}