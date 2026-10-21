import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { gradientCSS } from '@jematrace/seg-speed';

import { detectClientIp, inspect, type InspectHop, type InspectResponse } from './api';
import { CableModal } from './CableModal';
import { TimelineBar } from './TimelineBar';
import { useTimeline, useYearFocus } from './timeline';
import { DEMO_ANCHOR, DEMO_TARGET, DEMO_TRACE } from './demo';
import { guessTarget, Loading } from './Loading';
import { useT } from './i18n';
// Globe et carte charges a la demande (chunks separes).
const Globe = lazy(() => import('./Globe').then((m) => ({ default: m.Globe })));
import { cablePalette, LOOKS, lookById, type CablePalette } from './looks';
const Map2D = lazy(() => import('./Map2D').then((m) => ({ default: m.Map2D })));
import { Panel, type RecentEntry } from './Panel';
import { DEFAULT_PREFS, readPrefs, writePrefs, type Prefs, type RouteMode, type Theme } from './prefs';

const PLACEHOLDER = `traceroute to google.com (142.250.74.110), 30 hops max
 1  192.168.1.1 (192.168.1.1)  1.234 ms
 2  * * *
 3  203.0.113.1 (203.0.113.1)  8.456 ms
 ...`;

/** Systèmes proposés pour la commande à coller dans le terminal. */
const OSES = [
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
  { id: 'macos', label: 'macOS' },
  { id: 'jemaos', label: 'JemaOS' },
] as const;

type Os = (typeof OSES)[number]['id'];

/** Comment ouvrir le terminal du système choisi, avant de coller la commande. */
const OS_HELP: Record<Os, 'paste.help.windows' | 'paste.help.linux' | 'paste.help.macos' | 'paste.help.jemaos'> = {
  windows: 'paste.help.windows',
  linux: 'paste.help.linux',
  macos: 'paste.help.macos',
  jemaos: 'paste.help.jemaos',
};

function isOs(value: string | null): value is Os {
  return OSES.some((o) => o.id === value);
}

/**
 * Commande à coller dans le terminal du système choisi : elle lance le
 * traceroute ET met sa sortie dans le presse-papiers, prête à être collée ici.
 */
function commandFor(host: string, os: Os): string {
  const target = host || 'exemple.com';
  switch (os) {
    case 'windows':
      return `tracert ${target} | clip`;
    case 'macos':
      return `traceroute ${target} | pbcopy`;
    case 'jemaos':
      return `tracepath ${target}`;
    case 'linux':
    default:
      return `traceroute ${target} | xclip -sel clip`;
  }
}

/** Système deviné depuis le navigateur ; l'utilisateur peut toujours changer. */
function guessOs(ua: string): Os {
  if (/CrOS/i.test(ua)) return 'jemaos';
  if (/Windows|Win32|Win64/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  return 'linux';
}

/* ------------------------------------------------------------------ modales */

function InfoModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function PreferencesModal({
  draft,
  setDraft,
  onClose,
  onSave,
}: {
  draft: Prefs;
  setDraft: (p: Prefs) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useT();
  const toggle = (key: keyof Prefs) => setDraft({ ...draft, [key]: !draft[key] });

  return (
    <InfoModal title="Préférences" onClose={onClose}>
      <div className="row">
        <span>
          <b>{t('prefs.theme')}</b>
        </span>
        <div className="seg">
          <button className={draft.theme === 'dark' ? 'on' : ''} onClick={() => setDraft({ ...draft, theme: 'dark' })}>
            {t('prefs.themeDark')}
          </button>
          <button className={draft.theme === 'light' ? 'on' : ''} onClick={() => setDraft({ ...draft, theme: 'light' })}>
            {t('prefs.themeLight')}
          </button>
        </div>
      </div>

      <label className="row">
        <span>
          <b>{t('prefs.look')}</b>
        </span>
        <select value={draft.look} onChange={(e) => setDraft({ ...draft, look: e.target.value })}>
          {LOOKS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <label className="row check">
        <input type="checkbox" checked={draft.view === '2d'} onChange={() => setDraft({ ...draft, view: draft.view === '2d' ? '3d' : '2d' })} />
        <span>
          <b>{t('prefs.view2d')}</b>
          <small>Démarrer avec la carte 2D au lieu du globe 3D</small>
        </span>
      </label>

      <label className="row check">
        <input type="checkbox" checked={draft.route === 'topo'} onChange={() => setDraft({ ...draft, route: draft.route === 'topo' ? 'line' : 'topo' })} />
        <span>
          <b>{t('prefs.route')}</b>
          <small>Suivre les câbles réels (Topo) au lieu de lignes droites</small>
        </span>
      </label>

      <label className="row check">
        <input type="checkbox" checked={draft.cables} onChange={() => toggle('cables')} />
        <span>
          <b>{t('prefs.cables')}</b>
          <small>Afficher le réseau de câbles et les particules qui y circulent</small>
        </span>
      </label>

      <label className="row check">
        <input type="checkbox" checked={draft.cities} onChange={() => toggle('cities')} />
        <span>
          <b>{t('prefs.cities')}</b>
          <small>Afficher les points des grandes villes sur le globe 3D</small>
        </span>
      </label>

      <label className="row check">
        <input type="checkbox" checked={draft.geek} onChange={() => toggle('geek')} />
        <span>
          <b>{t('prefs.geek')}</b>
          <small>Afficher les données techniques</small>
        </span>
      </label>

      <div className="modal-foot">
        <span className="muted">Les réglages sont enregistrés dans votre navigateur.</span>
        <button className="primary inline" onClick={onSave}>
          Enregistrer
        </button>
      </div>
    </InfoModal>
  );
}

/* ------------------------------------------------------------------- coller */

function PasteView({
  onSubmit,
  busy,
  error,
  initialText,
}: {
  onSubmit: (t: string) => void;
  busy: boolean;
  error: string | null;
  initialText: string;
}) {
  const { t } = useT();
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [os, setOs] = useState<Os>(() => {
    const saved = localStorage.getItem('gt_os');
    return isOs(saved) ? saved : guessOs(navigator.userAgent);
  });
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const pickOs = (next: Os) => {
    setOs(next);
    setCopied(false);
    try {
      localStorage.setItem('gt_os', next);
    } catch {
      // stockage refusé : le choix vaut pour la session
    }
  };

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  // ⌘V / Ctrl+V n'importe où dans la page : on remplit et on analyse.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'TEXTAREA') return;
      const pasted = e.clipboardData?.getData('text') ?? '';
      if (pasted.trim().length < 8) return;
      e.preventDefault();
      setText(pasted);
      onSubmit(pasted);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onSubmit]);

  const cmd = useMemo(() => commandFor('exemple.com', os), [os]);

  return (
    <div className="paste">
      <h1>
        {t('paste.title')}<span>{t('paste.titleAccent')}</span>
      </h1>
      <p>
        {t('paste.desc1')}<code>traceroute</code>, <code>tracert</code>{t('paste.desc2')}<code>mtr</code>{t('paste.desc3')}
        
      </p>

      <label htmlFor="tr">{t('paste.label')}</label>
      <textarea
        id="tr"
        ref={areaRef}
        value={text}
        placeholder={PLACEHOLDER}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="hint">
        {t('paste.supported')} <em>traceroute</em> Linux, <em>tracert</em> Windows, <em>mtr</em>,{' '}
        <em>tracepath</em> (JemaOS) {t('paste.orPaste')} <em>Ctrl+V</em> {t('paste.anywhere')}
      </div>

      <div className="os-row">
        <span>{t('paste.os')}</span>
        <div className="seg">
          {OSES.map((option) => (
            <button
              key={option.id}
              className={os === option.id ? 'on' : ''}
              onClick={() => pickOs(option.id)}
              aria-pressed={os === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="actions">
        <button className="primary" disabled={busy || text.trim().length === 0} onClick={() => onSubmit(text)}>
          {busy ? t('paste.analyzing') : t('paste.visualize')}
        </button>
        <button
          className="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(cmd).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          {copied ? t('paste.copied') : t('paste.copyCommand')}
        </button>
        <button
          className="ghost"
          onClick={() => {
            void navigator.clipboard.readText().then((t) => {
              if (t.trim().length > 0) onSubmit(t);
            });
          }}
        >
          {t('paste.fromClipboard')}
        </button>
      </div>

      <div className="hint">
        {t('paste.onYourMachine')} {t(OS_HELP[os])} <code>{cmd}</code>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}

/* --------------------------------------------------------------------- app */

export default function App() {
  const { t, lang, setLang } = useT();
  const [data, setData] = useState<InspectResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  /** Frise des câbles : année courante, lecture, bornes. */
  const timeline = useTimeline();
  /** Câbles de l'année courante : cadrage automatique sur la carte et le globe. */
  const yearFocus = useYearFocus(timeline.year);
  const [draft, setDraft] = useState<Prefs>(() => readPrefs());

  /**
   * Thème appliqué au document. `data-theme` suffit : toutes les couleurs de
   * l'interface passent par des variables CSS. L'attribut est posé avant le
   * premier rendu utile et suit la préférence (modale comme bouton du bandeau).
   */
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    // La barre du navigateur suit aussi le thème.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', prefs.theme === 'light' ? '#eef2f7' : '#070b14');
  }, [prefs.theme]);
  const [modal, setModal] = useState<'prefs' | 'method' | 'credits' | 'contact' | null>(null);
  /** Nom du câble dont la fiche est ouverte (clic sur un câble en 2D). */
  const [cableName, setCableName] = useState<string | null>(null);
  /**
   * Point demandé depuis une fiche (atterrissage cliqué) : la carte 2D y vole
   * et le globe s'y tourne. 
ull = cadrage normal (traceroute / frise).
   */
  const [focusAt, setFocusAt] = useState<{ lat: number; lon: number } | null>(null);
  const [lastText, setLastText] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  /** Vrai tant que le resultat affiche est la trace de demonstration. */
  const [isDemo, setIsDemo] = useState(false);
  /** Vrai pendant l'ouverture : evite d'afficher l'ecran de collage puis la demo. */
  const [booting, setBooting] = useState(true);
  /** Ville d'origine connue, affichée pendant l'analyse suivante. */
  const [sourceCity, setSourceCity] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('gt_recent') ?? '[]') as RecentEntry[];
    } catch {
      return [];
    }
  });


  /**
   * Repr�sentants pour la carte 2D : un point par ville (comme l'original),
   * et non un point par saut.
   */
  const mapHops = useMemo(() => {
    if (!data?.result) return [];
    return data.result.groups.map((g) => {
      const last = g.hops[g.hops.length - 1]!;
      const colored = data.hops.find((h) => h.ttl === last.ttl);
      return {
        ...last,
        lat: g.lat,
        lon: g.lon,
        rttMs: g.rttMs,
        color: colored?.color ?? '#7ee787',
        timeout: false,
        ...(g.polyline ? { polyline: g.polyline } : {}),
      };
    });
  }, [data]);

  /** Point de depart : l'IP publique du visiteur, placee en #0. */
  const clientHop = useMemo<InspectHop | null>(() => {
    // Position du visiteur (#0), déduite de son IP : elle s'affiche aussi sur
    // la démonstration, pour que chacun voie son propre point de départ.
    const c = data?.client;
    if (!c) return null;
    return {
      ttl: 0, ip: c.ip, host: null, rttMs: 0, asn: null, asName: null,
      country: null, continent: null, city: c.city, lat: c.lat, lon: c.lon,
      confidence: 1, private: false, estimated: false, color: '#5b5bf0', timeout: false,
    };
  }, [data]);

  const mapHopsWithClient = useMemo(
    () => (clientHop ? [clientHop, ...mapHops] : mapHops),
    [clientHop, mapHops],
  );

  const globeHops = useMemo(
    () => (clientHop ? [clientHop, ...(data?.hops ?? [])] : (data?.hops ?? [])),
    [clientHop, data],
  );
  /**
   * Tracé affiché en entier dès que le résultat arrive, et sans saut « actif ».
   * Il y avait ici une animation qui allumait les segments un par un (110 ms)
   * puis faisait ressortir chaque ville : elle faisait varier la luminosité en
   * continu. Le tracé et les villes sont désormais statiques.
   */

  const look = useMemo(() => lookById(prefs.look), [prefs.look]);

  /**
   * Fond clair ou sombre pour la palette des câbles : ce qui compte est le
   * **fond affiché**, pas le thème de l'interface. Le globe est toujours
   * sombre ; seul le fond 2D Atlas/Soleil est clair.
   */
  const cableLight = prefs.view === '2d' && look.basemap.light === true;

  /**
   * Hauteur réelle du bloc de contrôles, publiée en CSS (`--controls-h`).
   *
   * En vue empilée, la frise se place au-dessus des contrôles. Leur hauteur
   * varie : ils tiennent sur deux lignes sur un écran étroit et la ligne du
   * sélecteur d'apparence peut elle-même passer à la suivante. Une valeur
   * fixe en CSS produisait un recouvrement ; la mesure le supprime.
   */
  const controlsObserver = useRef<ResizeObserver | null>(null);
  /**
   * Ref-callback et non `useRef` + effet : le bloc de contrôles n'existe
   * qu'une fois les données chargées. Un effet monté au démarrage ne voyait
   * donc jamais l'élément, et la variable restait vide — d'où le recouvrement
   * de la frise en vue empilée.
   */
  const setControlsRef = useCallback((el: HTMLDivElement | null) => {
    controlsObserver.current?.disconnect();
    controlsObserver.current = null;
    if (!el) return;
    const apply = () => {
      document.documentElement.style.setProperty(
        '--controls-h',
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    controlsObserver.current = observer;
  }, []);

  const run = useCallback(
    async (text: string, options?: { mode?: RouteMode; demo?: boolean }) => {
      setBusy(true);
      setError(null);
      setLastText(text);
      setIsDemo(Boolean(options?.demo));
      try {
        // L'ancre, c'est l'IP publique du visiteur : elle sert à géolocaliser
        // les premiers sauts, y compris pour la démonstration (sinon la trace
        // d'accueil ne correspond pas à l'endroit d'où l'on regarde).
        // Elle n'est jamais affichée : la ligne #0 est masquée en mode démo.
        const clientIp = await detectClientIp();
        const res = await inspect(
          text,
          options?.mode ?? prefs.route,
          clientIp ?? undefined,
          // Repli si la détection d'IP échoue (hors ligne, bloqueur).
          clientIp ? undefined : DEMO_ANCHOR,
        );
        if (res.error || !res.result) {
          setError(res.error ?? 'Traceroute illisible.');
          setData(null);
        } else if (res.hops.length === 0) {
          // Texte collé qui ne contient aucun saut reconnaissable : sans ce
          // garde-fou, on affichait une fiche vide (cible inconnue, 0 km) et
          // elle partait dans l'historique.
          setError(t('paste.noHops'));
          setData(null);
        } else {
          setData(res);
          setPanelOpen(true);
          // La ville d'origine, réutilisée pour l'écran d'analyse suivant.
          if (res.client?.city) setSourceCity(res.client.city);
          // La démonstration ne doit pas polluer l'historique de l'utilisateur.
          if (!options?.demo) {
            void fetch('/api/recent', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ target: res.result!.target }),
            }).catch(() => {});
            setRecent((prev) => {
              const next = [
                { target: res.result!.target, at: Date.now(), text },
                ...prev.filter((r) => r.target !== res.result!.target),
              ].slice(0, 10);
              localStorage.setItem('gt_recent', JSON.stringify(next));
              return next;
            });
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        setBooting(false);
      }
    },
    [prefs.route, t],
  );

  /**
   * Bascule Topo / Ligne et relance l'analyse. Le mode est transmis
   * explicitement : `run` ne doit pas dépendre d'un état pas encore appliqué.
   */
  const switchRoute = useCallback(
    (route: RouteMode) => {
      setPrefs((current) => ({ ...current, route }));
      if (lastText) void run(lastText, { mode: route, demo: isDemo });
    },
    [isDemo, lastText, run],
  );

  /**
   * Retour à l'accueil : la page d'accueil, c'est la démonstration. Le logo y
   * ramène ; « Lancer sa traceroute » ouvre, lui, la zone de collage vide.
   */
  const goHome = useCallback(() => {
    setPanelOpen(true);
    void run(DEMO_TRACE, { demo: true });
  }, [run]);

  /** Zone de collage vierge, pour saisir sa propre trace. */
  const newTrace = useCallback(() => {
    setData(null);
    setError(null);
    setLastText('');
    setIsDemo(false);
    setPanelOpen(true);
  }, []);

  /**
   * Ouverture : on affiche tout de suite la trace de démonstration, sauf si un
   * lien ?share=xxxx apporte un trace précis (et retombe sur la démo s'il est
   * introuvable, pour ne jamais laisser l'écran vide).
   */
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const id = new URLSearchParams(location.search).get('share');
    if (!id) {
      void run(DEMO_TRACE, { demo: true });
      return;
    }

    fetch(`/api/share/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { text?: string } | null) => (d?.text ? run(d.text) : run(DEMO_TRACE, { demo: true })))
      .catch(() => {
        void run(DEMO_TRACE, { demo: true });
      });
  }, [run]);

  /**
   * Changement de réseau (5G → Wi-Fi) ou retour depuis l'arrière-plan : l'IP
   * publique change, donc la position du visiteur (#0) et la géolocalisation
   * des premiers sauts. On relance la trace affichée pour ne pas garder les
   * données de l'ancien réseau.
   */
  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      const now = Date.now();
      // Deux événements arrivent souvent ensemble (online + pageshow).
      if (now - lastRefresh < 3000) return;
      lastRefresh = now;
      if (lastText) void run(lastText, { demo: isDemo });
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // On ne relance que si l'IP publique a réellement changé (passage
      // 5G ↔ Wi-Fi, VPN), pour ne pas recharger pour rien.
      const known = data?.client?.ip;
      if (!lastText || !known) return;
      void detectClientIp().then((ip) => {
        if (ip && ip !== known) refresh();
      });
    };

    window.addEventListener('online', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [data, isDemo, lastText, run]);

  // Recents globaux du serveur, fusionnes avec les locaux.
  useEffect(() => {
    fetch('/api/recent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: RecentEntry[] } | null) => {
        if (!d?.items?.length) return;
        setRecent((prev) => {
          const map = new Map(prev.map((r) => [r.target, r]));
          for (const item of d.items!) if (!map.has(item.target)) map.set(item.target, item);
          return [...map.values()].sort((a, b) => b.at - a.at).slice(0, 10);
        });
      })
      .catch(() => {});
  }, []);

  if (!data?.result) {
    // Pendant l'ouverture et pendant une analyse, l'écran d'attente remplace
    // l'écran de collage (sinon il apparaîtrait puis serait remplacé aussitôt).
    if (booting || busy) {
      return (
        <div className="app">
          <div className="brand">
            Jema<span>Trace</span>
          </div>
          <Loading
            target={booting ? DEMO_TARGET : guessTarget(lastText)}
            source={sourceCity}
          />
        </div>
      );
    }
    return (
      <div className="app">
        <button className="brand" onClick={goHome} title="Retour à l'accueil">
          Jema<span>Trace</span>
        </button>
        <PasteView onSubmit={run} busy={busy} error={error} initialText={lastText} />
      </div>
    );
  }

  const share = async () => {
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: lastText }),
      });
      const data = (await res.json()) as { ok: boolean; id?: string };
      if (data.ok && data.id) {
        await navigator.clipboard.writeText(`${location.origin}/s/${data.id}`);
      }
    } catch {
      // le partage n'est pas bloquant
    }
  };

  return (
    <div className={panelOpen ? 'app' : 'app app--panel-closed'}>
      <header className={panelOpen ? 'topbar' : 'topbar topbar--floating'}>
        <button className="brand inline-brand" onClick={goHome} title="Retour à l'accueil">
          Jema<span>Trace</span>
        </button>
        {/* Langue et navigation forment un seul bloc à droite : séparées, le
            `space-between` du bandeau plaçait le sélecteur au milieu. */}
        <div className="topbar-right">
          <button
            className="theme-toggle"
            title={prefs.theme === 'dark' ? t('nav.themeDark') : t('nav.themeLight')}
            aria-label={prefs.theme === 'dark' ? t('nav.themeDark') : t('nav.themeLight')}
            onClick={() => {
              const theme: Theme = prefs.theme === 'dark' ? 'light' : 'dark';
              const next = { ...prefs, theme };
              setPrefs(next);
              writePrefs(next);
            }}
          >
            {/* Soleil en thème sombre (action : passer en clair), lune sinon. */}
            {prefs.theme === 'dark' ? (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" fill="currentColor" />
                <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
                </g>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
          <button
            className="lang-pill"
            title="Choisir la langue / Choose language"
            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
          >
            {lang.toUpperCase()}
            <i className="caret" />
          </button>
          <nav>
            <button onClick={() => { setDraft(prefs); setModal('prefs'); }}>{t('nav.prefs')}</button>
            <button onClick={() => setModal('credits')}>{t('nav.credits')}</button>
          </nav>
        </div>
      </header>

      {panelOpen ? (
        <Panel
          result={data.result}
          hops={data.hops}
          geek={prefs.geek}
          warning={data.warnings[0]}
          client={data.client}
          onReset={newTrace}
          onShare={share}
          onCollapse={() => setPanelOpen(false)}
          recent={recent}
          onPickRecent={(r) => {
            if (r.text) void run(r.text);
          }}
        />
      ) : (
        <button className="panel-open" onClick={() => setPanelOpen(true)} aria-label="Afficher / masquer le panneau">
          <span className="chev" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      {/* En 3D, le fond décalé du volet centre le globe dans l'espace visible. */}
      <div className={panelOpen && prefs.view === '3d' ? 'canvas-wrap canvas-wrap--globe' : 'canvas-wrap'}>
        <Suspense fallback={<div className="spinner">Chargement du globe...</div>}>
        {prefs.view === '2d' ? (
          <Map2D
            hops={mapHopsWithClient}
            showCables={prefs.cables}
            look={look}
            onCable={setCableName}
            year={timeline.year}
            focus={yearFocus}
            selected={cableName}
            at={focusAt}
          />
        ) : (
          <Globe
            hops={globeHops}
            look={look}
            showCities={prefs.cities}
            showCables={prefs.cables}
            year={timeline.year}
            focusPoint={yearFocus}
            selected={cableName}
            onCable={setCableName}
            at={focusAt}
          />
        )}
        </Suspense>
      </div>

      {/* Frise de l'histoire du réseau sous-marin : même année pour le globe et la 2D. */}
      <TimelineBar timeline={timeline} />

      {/* Regroupés pour que la vue empilée les ancre d'un bloc, sans chevauchement. */}
      <div className="controls" ref={setControlsRef}>
        <div className="ctrl-left">
          <div className="seg">
            <button className={prefs.view === '3d' ? 'on' : ''} onClick={() => setPrefs({ ...prefs, view: '3d' })}>
              3D
            </button>
            <button className={prefs.view === '2d' ? 'on' : ''} onClick={() => setPrefs({ ...prefs, view: '2d' })}>
              2D
            </button>
          </div>
          <div className="seg">
            <button className={prefs.route === 'topo' ? 'on' : ''} onClick={() => switchRoute('topo')}>
              Topo
            </button>
            <button className={prefs.route === 'line' ? 'on' : ''} onClick={() => switchRoute('line')}>
              Ligne
            </button>
          </div>
        </div>

        <div className="ctrl-right">
          <button className={prefs.cities ? 'on' : ''} title="Afficher / masquer les villes" onClick={() => setPrefs({ ...prefs, cities: !prefs.cities })}>
            {t('ctrl.cities')}
          </button>
          <button className={prefs.cables ? 'on' : ''} title="Afficher / masquer les câbles sous-marins" onClick={() => setPrefs({ ...prefs, cables: !prefs.cables })}>
            {t('ctrl.cables')}
          </button>
          <select value={prefs.look} onChange={(e) => setPrefs({ ...prefs, look: e.target.value })} title="Apparence du globe">
            {LOOKS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Légende des câbles : mêmes codes couleur que la carte de référence. */}
      {prefs.cables && (
        <div className="cable-legend">
          <div className="title">{t('legend.cables')}</div>
          <ul>
            {[
              ['regular', t('legend.existing')],
              ['isNew', t('legend.new')],
              ['decommissioned', t('legend.decommissioned')],
              ['selected', t('legend.selected')],
            ].map(([state, label]) => (
              <li key={state}>
                <i style={{ background: cablePalette(cableLight)[state as keyof CablePalette].color }} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="legend">
        <div className="title">{t('legend.title')}</div>
        <div className="bar" style={{ background: gradientCSS() }} />
        <div className="scale">
          <span>{t('legend.slow')}</span>
          <span>{t('legend.avg')}</span>
          <span>{t('legend.fast')}</span>
        </div>
      </div>



      {modal === 'prefs' && (
        <PreferencesModal
          draft={draft}
          setDraft={setDraft}
          onClose={() => setModal(null)}
          onSave={() => {
            writePrefs(draft);
            const routeChanged = draft.route !== prefs.route;
            setPrefs(draft);
            setModal(null);
            if (routeChanged && lastText) void run(lastText, { mode: draft.route, demo: isDemo });
          }}
        />
      )}


      {modal === 'credits' && (
        <InfoModal title="À propos" onClose={() => setModal(null)}>
          <ul>
            <li>Contours du monde : Natural Earth (domaine public).</li>
            <li>Câbles sous-marins : TeleGeography, licence CC BY-NC-SA (usage non commercial).</li>
            <li>Ville et coordonnées : DB-IP City Lite (CC BY 4.0), avec repli sur ip-api.</li>
            <li>ASN : RIPEstat (RIPE NCC).</li>
            <li>Base ville locale : DB-IP Lite (CC BY 4.0).</li>
            <li>Tuiles de la carte 2D : OpenStreetMap / CARTO.</li>
          </ul>
        </InfoModal>
      )}

      {/* Fiche d'un câble, ouverte au clic sur son tracé dans la carte 2D. */}
      {cableName && (
        <CableModal
          name={cableName}
          year={timeline.year}
          onClose={() => setCableName(null)}
          onLanding={(lat, lon) => setFocusAt({ lat, lon })}
        />
      )}

    </div>
  );
}
