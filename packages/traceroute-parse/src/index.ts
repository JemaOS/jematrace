/**
 * Parsing des sorties de traceroute collées par l'utilisateur.
 *
 * Formats pris en charge :
 *  - `traceroute`  (Linux / macOS)
 *  - `tracert`     (Windows, FR et EN)
 *  - `mtr --report` (Linux)
 *  - `tracepath`   (ChromeOS `crosh`, Linux)
 *
 * Le but est de reproduire exactement ce que fait le site de référence :
 * lire les mêmes entrées, y compris les variantes localisées, les sauts
 * muets, les formes `nom [ip]` et `nom (ip)`, et les IP privées.
 */

import type { Hop, ParsedTrace, TraceFormat } from '@geotrace/shared';

const APOSTROPHE = /\u2019/g;

/** Uniformise le texte : fins de ligne, espaces insécables, apostrophes typographiques. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(APOSTROPHE, "'")
    .replace(/[\u00a0\u202f\u2007]/g, ' ');
}

/** IP privée, loopback ou link-local (jamais géolocalisable). */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254) ||
    a >= 224
  );
}

const HOST_WITH_BRACKETS = /^(.*?)\s*\[([0-9a-fA-F:.]+)\]$/;
const HOST_WITH_PARENS = /^(.*?)\s*\(([0-9a-fA-F:.]+)\)$/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** `true` si la chaîne est une IP v4 ou v6 plausible (rejette `.` ou `...`). */
function isIp(s: string): boolean {
  if (IPV4.test(s)) {
    return s.split('.').every((o) => Number.parseInt(o, 10) <= 255);
  }
  if (!s.includes(':') || !/[0-9a-fA-F]/.test(s) || !/^[0-9a-fA-F:]+$/.test(s)) return false;
  return true;
}

/** Extrait `{ host, ip }` d'un fragment `nom [1.2.3.4]`, `nom (1.2.3.4)` ou `1.2.3.4`. */
function splitHostIp(chunk: string): { host: string | null; ip: string | null } {
  const s = chunk.trim();
  let m = HOST_WITH_BRACKETS.exec(s);
  if (m) return { host: m[1]!.trim() || null, ip: m[2]! };
  m = HOST_WITH_PARENS.exec(s);
  if (m) {
    const name = m[1]!.trim();
    // « 192.168.1.1 (192.168.1.1) » : le nom n'en est pas un.
    return { host: isIp(name) ? null : name || null, ip: m[2]! };
  }
  if (isIp(s)) return { host: null, ip: s };
  return { host: s || null, ip: null };
}

/** Extrait les latences `12 ms`, `12.3 ms`, `<1 ms` d'un fragment. */
function extractRtts(chunk: string): number[] {
  const out: number[] = [];
  const re = /(?:<\s*)?(\d+(?:[.,]\d+)?)\s*ms/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk)) !== null) out.push(Number.parseFloat(m[1]!.replace(',', '.')));
  return out;
}

const TIMEOUT_TEXTS = [
  /request timed out\.?/i,
  /délai d'attente de la demande dépassé\.?/i,
  /no reply\.?/i,
];

function isTimeoutText(chunk: string): boolean {
  return TIMEOUT_TEXTS.some((re) => re.test(chunk));
}

/** Retire les latences, les astérisques et les textes de timeout d'un fragment. */
function stripLatency(chunk: string): string {
  let s = chunk.replace(/(?:<\s*)?\d+(?:[.,]\d+)?\s*ms/gi, ' ');
  s = s.replace(/\*/g, ' ');
  for (const re of TIMEOUT_TEXTS) s = s.replace(re, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function makeHop(ttl: number, chunk: string): Hop {
  const rttMs = extractRtts(chunk);
  const hostPart = stripLatency(chunk);
  const { host, ip } = splitHostIp(hostPart);
  const timeout = rttMs.length === 0 || (ip === null && host === null && isTimeoutText(chunk));
  return {
    ttl,
    ip,
    host,
    rttMs,
    timeout,
    private: ip !== null ? isPrivateIp(ip) : false,
  };
}

/* ------------------------------------------------------------------ tracert */

function parseTracert(lines: string[], warnings: string[]): { target: string | null; destIp: string | null; maxHops: number | null; hops: Hop[] } {
  let target: string | null = null;
  let destIp: string | null = null;
  let maxHops: number | null = null;
  const hops: Hop[] = [];

  for (const line of lines) {
    const head = /(?:tracing route to|détermination de l'itinéraire vers)\s+(\S+)\s+\[([^\]]+)\]/i.exec(line);
    if (head) {
      target = head[1]!;
      destIp = head[2]!;
      continue;
    }
    const max = /(?:over a maximum of|avec un maximum de)\s+(\d+)\s+(?:hops|sauts)/i.exec(line);
    if (max) {
      maxHops = Number.parseInt(max[1]!, 10);
      continue;
    }
    const row = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!row) continue;
    const ttl = Number.parseInt(row[1]!, 10);
    const rest = row[2]!;
    // Une ligne de saut contient des `ms` ou des `*`.
    if (!/\d+\s*ms|\*/.test(rest)) continue;
    hops.push(makeHop(ttl, rest));
  }

  if (hops.length === 0) warnings.push('Aucun saut reconnu (format tracert attendu).');
  return { target, destIp, maxHops, hops };
}

/* --------------------------------------------------------------- traceroute */

function parseTracerouteLinux(lines: string[], warnings: string[]): { target: string | null; destIp: string | null; maxHops: number | null; hops: Hop[] } {
  let target: string | null = null;
  let destIp: string | null = null;
  let maxHops: number | null = null;
  const hops: Hop[] = [];

  for (const line of lines) {
    const head = /traceroute to\s+(\S+)\s+\(([^)]+)\)(?:,\s*(\d+)\s+hops max)?/i.exec(line);
    if (head) {
      target = head[1]!;
      destIp = head[2]!;
      maxHops = head[3] ? Number.parseInt(head[3], 10) : null;
      continue;
    }
    const row = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!row) continue;
    const ttl = Number.parseInt(row[1]!, 10);
    hops.push(makeHop(ttl, row[2]!));
  }

  if (hops.length === 0) warnings.push('Aucun saut reconnu (format traceroute attendu).');
  return { target, destIp, maxHops, hops };
}

/* ---------------------------------------------------------------------- mtr */

function parseMtr(lines: string[], warnings: string[]): { target: string | null; destIp: string | null; maxHops: number | null; hops: Hop[] } {
  let target: string | null = null;
  let destIp: string | null = null;
  const hops: Hop[] = [];

  const head = lines.find((l) => l.startsWith('HOST:'));
  if (head) target = head.replace('HOST:', '').trim().split(/\s+/)[0] ?? null;

  const rowRe = /^\s*(\d+)\.\|\-\-\s+(\S+)\s+([\d.]+)%\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/;
  for (const line of lines) {
    const m = rowRe.exec(line);
    if (!m) continue;
    const ttl = Number.parseInt(m[1]!, 10);
    const rawHost = m[2]!;
    const loss = Number.parseFloat(m[3]!);
    const last = Number.parseFloat(m[5]!);
    const noReply = rawHost === '???' || loss >= 100;
    const { host, ip } = splitHostIp(rawHost === '???' ? '' : rawHost);
    hops.push({
      ttl,
      ip: noReply ? null : ip,
      host: noReply ? null : host,
      rttMs: noReply ? [] : [last],
      timeout: noReply,
      private: !noReply && ip !== null ? isPrivateIp(ip) : false,
    });
  }

  if (hops.length === 0) warnings.push('Aucun saut reconnu (format mtr --report attendu).');
  return { target, destIp, maxHops: null, hops };
}

/* ---------------------------------------------------------------- tracepath */

function parseTracepath(lines: string[], warnings: string[]): { target: string | null; destIp: string | null; maxHops: number | null; hops: Hop[] } {
  const byTtl = new Map<number, Hop>();

  for (const line of lines) {
    const row = /^\s*(\d+)\??:\s+(.*)$/.exec(line);
    if (!row) continue;
    const ttl = Number.parseInt(row[1]!, 10);
    const body = row[2]!.trim();

    // `1?: [LOCALHOST] pmtu 1500` : ligne d'information MTU.
    if (body.startsWith('[') || /^\[?LOCALHOST\]?/i.test(body)) continue;
    if (/^no reply$/i.test(body)) {
      if (!byTtl.has(ttl)) {
        byTtl.set(ttl, { ttl, ip: null, host: null, rttMs: [], timeout: true, private: false });
      }
      continue;
    }

    const rtts = extractRtts(body);
    const stripped = body
      .replace(/(?:<\s*)?\d+(?:[.,]\d+)?\s*ms/gi, ' ')
      .replace(/\s*(?:pmtu|asymm)\s+\d+\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const { host, ip } = splitHostIp(stripped);
    const candidate: Hop = {
      ttl,
      ip,
      host,
      rttMs: rtts,
      timeout: rtts.length === 0,
      private: ip !== null ? isPrivateIp(ip) : false,
    };
    const prev = byTtl.get(ttl);
    // tracepath répète souvent le même TTL : on garde la latence la plus faible.
    if (!prev) byTtl.set(ttl, candidate);
    else {
      const best = (h: Hop) => (h.rttMs.length ? Math.min(...h.rttMs) : Number.POSITIVE_INFINITY);
      if (best(candidate) < best(prev)) byTtl.set(ttl, candidate);
    }
  }

  if (byTtl.size === 0) warnings.push('Aucun saut reconnu (format tracepath attendu).');
  return { target: null, destIp: null, maxHops: null, hops: [...byTtl.values()] };
}

/* --------------------------------------- copier-coller abîmé (terminal mobile) */

/**
 * Un copier-coller depuis un terminal mobile abîme souvent la sortie :
 *   - tout est mis sur une seule ligne (retours à la ligne perdus) ;
 *   - une IP est coupée en deux (« 80.15.22 4.25 ») ;
 *   - un point devient une virgule (« 172,217.18.9 ») ;
 *   - les latences disparaissent.
 *
 * Les parseurs de format ne peuvent rien en faire, mais l'essentiel reste
 * récupérable : l'ordre des sauts et les IP. C'est ce que fait ce filet de
 * sécurité, utilisé uniquement quand l'analyse normale n'a trouvé aucun saut.
 */

/** Nettoie un jeton : ponctuation de bord retirée, espaces ignorés. */
function cleanToken(token: string): string {
  return token.replace(/^[.,;:]+/, '').replace(/[.,;:]+$/, '');
}

/** Candidat IP : crochets/parenthèses retirés, virgules converties en points. */
function toIp(raw: string): string | null {
  const clean = raw
    .replace(/^[[(]+/, '')
    .replace(/[\])]+$/, '')
    .replace(/,/g, '.');
  if (!IPV4.test(clean)) return null;
  return clean.split('.').every((o) => Number.parseInt(o, 10) <= 255) ? clean : null;
}

/**
 * Recolle les IP coupées par un espace.
 *
 * Les fenêtres les plus longues sont essayées d'abord : « 193.252.1 03.24 1 »
 * doit donner `193.252.103.241`, pas `193.252.103.24` suivi d'un `1` orphelin.
 */
function rejoinIps(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const first = tokens[i]!;
    const next = tokens[i + 1];
    const alone = toIp(cleanToken(first));

    /**
     * Deux indices disent qu'une IP a été coupée alors qu'elle est déjà
     * syntaxiquement valide (`172.217.18.9` est une IP : le `9` final manque) :
     *  - le jeton suivant porte une fermeture de crochet/parenthèse ;
     *  - l'IP contient une virgule, trace d'un point transformé au collage.
     */
    const cutHint = Boolean(next) && (/[\])]$/.test(next!) || first.includes(','));

    // Une IP complète et non suspecte ne doit jamais absorber le jeton suivant :
    // « 1.2.3.4 5 » resterait sinon « 1.2.3.45 ».
    if (alone && !cutHint) {
      out.push(alone);
      i += 1;
      continue;
    }

    // On ne recolle que si le premier morceau est déjà pointé : sinon le numéro
    // de saut (« 1 ») fusionnerait avec l'IP suivante (« 1.2.3.4 » → 11.2.3.4).
    if (/[.,]/.test(cleanToken(first))) {
      let matched = false;
      for (let n = Math.min(5, tokens.length - i); n >= 2; n--) {
        const ip = toIp(tokens.slice(i, i + n).map(cleanToken).join(''));
        if (ip) {
          out.push(ip);
          i += n;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    if (alone) {
      out.push(alone);
      i += 1;
      continue;
    }

    out.push(first);
    i += 1;
  }

  return out.join(' ');
}

interface Recovered {
  target: string | null;
  destIp: string | null;
  hops: Hop[];
}

/**
 * Reconstitue une trace à partir d'un texte aplati : en-tête, suite
 * « ttl IP » (ou « ttl nom [IP] », « ttl * »), et IP orphelines replacées dans
 * les sauts manquants.
 */
function recoverMangledTrace(text: string): Recovered | null {
  const repaired = rejoinIps(text);

  let target: string | null = null;
  let destIp: string | null = null;
  let body = repaired;

  const head =
    /\b(?:trace\s*route|traceroute|tracert)\s+(?:to\s+)?([A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*[[(]?\s*([0-9.,]+)\s*[\])]?/i.exec(
      repaired,
    );
  if (head) {
    target = head[1] ?? null;
    destIp = toIp(head[2] ?? '') ?? (head[2] ?? null);
    // On retire l'en-tête : son IP ne doit pas être prise pour un saut.
    body = repaired.replace(head[0], ' ');
  }

  const tokens = body.split(/\s+/).filter(Boolean);
  const pairs: Array<{ ttl: number; ip: string | null }> = [];
  const consumed = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const token = tokens[i]!;
    if (!/^\d{1,2}$/.test(token)) continue;
    const ttl = Number.parseInt(token, 10);
    if (ttl < 1 || ttl > 64) continue;

    const next = tokens[i + 1];
    if (next === '*') {
      pairs.push({ ttl, ip: null });
      consumed.add(i);
      consumed.add(i + 1);
      continue;
    }

    const direct = next ? toIp(cleanToken(next)) : null;
    if (direct) {
      pairs.push({ ttl, ip: direct });
      consumed.add(i);
      consumed.add(i + 1);
      continue;
    }

    // Forme « ttl  nom [ip] » : on saute le nom, mais seulement s'il en est un
    // (un simple chiffre serait un décalage du collage, pas un nom).
    const host = next;
    const after = tokens[i + 2];
    if (host && /[A-Za-z]/.test(host) && after) {
      const ip = toIp(cleanToken(after));
      if (ip) {
        pairs.push({ ttl, ip });
        consumed.add(i);
        consumed.add(i + 1);
        consumed.add(i + 2);
      }
    }
  }

  if (pairs.length < 2) return null;

  // IP présentes mais non rattachées à un saut : elles comblent les trous.
  const orphans: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const ip = toIp(cleanToken(tokens[i]!));
    if (ip) orphans.push(ip);
  }

  const byTtl = new Map<number, string | null>();
  for (const pair of pairs) {
    if (!byTtl.has(pair.ttl)) byTtl.set(pair.ttl, pair.ip);
  }

  const maxTtl = Math.max(...byTtl.keys());
  let orphanIndex = 0;
  for (let ttl = 1; ttl <= maxTtl && orphanIndex < orphans.length; ttl++) {
    if (!byTtl.has(ttl)) {
      byTtl.set(ttl, orphans[orphanIndex]!);
      orphanIndex += 1;
    }
  }

  const hops: Hop[] = [...byTtl.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ttl, ip]) => ({
      ttl,
      ip,
      host: null,
      // Latences perdues au collage : la vitesse ne sera pas calculable, mais
      // la route reste géolocalisable et affichable.
      rttMs: [],
      timeout: ip === null,
      private: ip !== null ? isPrivateIp(ip) : false,
    }));

  if (!destIp) destIp = [...hops].reverse().find((h) => h.ip)?.ip ?? null;
  return { target, destIp, hops };
}

/* ------------------------------------------------------------------ rapport */

/**
 * Rapport tabulaire (« RAPPORT DE TRAÇAGE RÉSEAU ») :
 *
 *   Cible : alibaba.com (47.246.137.105)
 *   Nombre total de sauts : 13
 *
 *   SAUT IP                 PING       PAYS             NOM D’HÔTE
 *   ------------------------------------------------------------------
 *   1    192.168.1.1        12.4 ms    Réseau local     -
 *   3    92.184.150.30      * * *      France           -
 *   6                       * * *      Inconnu          -
 *
 * Les colonnes sont alignées par au moins deux espaces ; un saut muet laisse la
 * colonne IP vide. On lit donc les colonnes, sans supposer un nombre fixe.
 */
function parseReport(lines: string[], warnings: string[]): { target: string | null; destIp: string | null; maxHops: number | null; hops: Hop[] } {
  let target: string | null = null;
  let destIp: string | null = null;
  let maxHops: number | null = null;
  const hops: Hop[] = [];

  for (const line of lines) {
    const head = /^\s*Cible\s*:\s*(\S+)\s*\(([^)]+)\)/i.exec(line);
    if (head) {
      target = head[1]!;
      destIp = head[2]!;
      continue;
    }

    const total = /Nombre total de sauts\s*:\s*(\d+)/i.exec(line);
    if (total) {
      maxHops = Number.parseInt(total[1]!, 10);
      continue;
    }

    // Une ligne de saut commence par son numéro, suivi d'au moins deux espaces.
    const row = /^\s*(\d{1,2})\s{2,}(.*)$/.exec(line);
    if (!row) continue;
    const ttl = Number.parseInt(row[1]!, 10);

    const cols = row[2]!
      .split(/\s{2,}/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cols.length === 0) continue;

    // La première colonne est l'IP quand le saut a répondu ; sinon elle contient
    // « * * * » et l'IP est absente.
    const rawIp = cols[0]!.replace(/[[\]()]/g, '');
    const ip = isIp(rawIp) ? rawIp : null;
    const rest = (ip ? cols.slice(1) : cols).join(' ');
    const rtts = extractRtts(rest);

    hops.push({
      ttl,
      ip,
      host: null,
      rttMs: rtts,
      // Un saut qui n'a pas répondu est marqué « * * * » : il reste dans la
      // liste, à sa place, pour que la numérotation corresponde à la source.
      timeout: rtts.length === 0,
      private: ip !== null ? isPrivateIp(ip) : false,
    });
  }

  if (hops.length === 0) warnings.push('Aucun saut reconnu (format rapport attendu).');
  return { target, destIp, maxHops, hops };
}

/* ------------------------------------------------------------------ public */

function detectFormat(text: string): TraceFormat {
  // Rapport tabulaire maison : en-tête explicite, ou colonnes SAUT/PING/PAYS.
  if (/RAPPORT DE TRA[ÇC]AGE R[ÉE]SEAU/i.test(text)) return 'report';
  if (/^\s*SAUT\b.*\bPING\b/im.test(text) && /PAYS/i.test(text)) return 'report';
  if (/(?:tracing route to|détermination de l'itinéraire vers)/i.test(text)) return 'tracert';
  if (/\.\|\-\-|loss%\s+snt/i.test(text)) return 'mtr';
  if (/resume:\s*pmtu|^\s*\d+\?:\s/m.test(text)) return 'tracepath';
  if (/traceroute to /i.test(text)) return 'traceroute';
  return 'tracert';
}

/** Parse un traceroute collé. Ne jette jamais : renvoie `warnings` en cas de doute. */
export function parseTraceroute(input: string): ParsedTrace {
  const warnings: string[] = [];
  const text = normalize(input);
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  const format = detectFormat(text);

  let parsed =
    format === 'tracert'
      ? parseTracert(lines, warnings)
      : format === 'mtr'
        ? parseMtr(lines, warnings)
        : format === 'tracepath'
          ? parseTracepath(lines, warnings)
          : format === 'report'
            ? parseReport(lines, warnings)
            : parseTracerouteLinux(lines, warnings);

  // Aucun saut reconnu : le texte a peut-être été aplati par un copier-coller
  // mobile. On tente la reconstitution avant de renoncer.
  if (parsed.hops.length === 0) {
    const recovered = recoverMangledTrace(text);
    if (recovered && recovered.hops.length >= 2) {
      warnings.length = 0;
      warnings.push(
        'Sortie abîmée par le copier-coller : sauts et IP reconstitués, latences indisponibles (vitesse non calculable).',
      );
      parsed = { ...recovered, maxHops: null };
    }
  }

  const hops = parsed.hops.slice().sort((a, b) => a.ttl - b.ttl);

  return {
    format,
    target: parsed.target,
    destIp: parsed.destIp,
    maxHops: parsed.maxHops,
    hops,
    warnings,
  };
}
