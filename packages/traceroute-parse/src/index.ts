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

/* ------------------------------------------------------------------ public */

function detectFormat(text: string): TraceFormat {
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

  const parsed =
    format === 'tracert'
      ? parseTracert(lines, warnings)
      : format === 'mtr'
        ? parseMtr(lines, warnings)
        : format === 'tracepath'
          ? parseTracepath(lines, warnings)
          : parseTracerouteLinux(lines, warnings);

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
