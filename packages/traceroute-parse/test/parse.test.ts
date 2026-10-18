import { describe, expect, it } from 'vitest';

import { isPrivateIp, parseTraceroute } from '../src/index';
import { MTR_REPORT, TRACEPATH, TRACERT_EN, TRACERT_FR, TRACEROUTE_LINUX } from './fixtures';

describe('isPrivateIp', () => {
  it('détecte les plages privées, loopback et link-local', () => {
    for (const ip of ['10.0.0.1', '192.168.1.1', '172.16.5.4', '172.31.255.254', '127.0.0.1', '169.254.1.1', '::1', 'fe80::1', 'fc00::1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('laisse passer les IP publiques', () => {
    for (const ip of ['8.8.8.8', '80.15.224.25', '172.32.0.1', '192.169.1.1', '2606:4700::1111']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe('tracert (Windows FR)', () => {
  const r = parseTraceroute(TRACERT_FR);

  it('reconnaît le format et l\'en-tête localisé', () => {
    expect(r.format).toBe('tracert');
    expect(r.target).toBe('exemple.com');
    expect(r.destIp).toBe('103.224.182.245');
    expect(r.maxHops).toBe(30);
    expect(r.warnings).toEqual([]);
  });

  it('extrait les 18 sauts dans l\'ordre', () => {
    expect(r.hops).toHaveLength(18);
    expect(r.hops.map((h) => h.ttl)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it('lit la passerelle locale comme privée', () => {
    const h1 = r.hops[0]!;
    expect(h1.ip).toBe('192.168.1.1');
    expect(h1.private).toBe(true);
    expect(h1.rttMs).toEqual([3, 3, 3]);
  });

  it('lit la forme « nom [ip] »', () => {
    const h4 = r.hops[3]!;
    expect(h4.host).toBe('ae43-0.nimar202.rbci.orange.net');
    expect(h4.ip).toBe('193.252.103.241');
    expect(h4.rttMs).toEqual([7, 7, 10]);
  });

  it('marque le saut muet en timeout sans IP', () => {
    const h6 = r.hops[5]!;
    expect(h6.timeout).toBe(true);
    expect(h6.ip).toBeNull();
    expect(h6.rttMs).toEqual([]);
  });

  it('gère la dernière ligne en IP nue', () => {
    const last = r.hops[17]!;
    expect(last.ip).toBe('103.224.182.245');
    expect(last.host).toBe('lb-182-245.above.com');
  });
});

describe('tracert (Windows EN)', () => {
  const r = parseTraceroute(TRACERT_EN);

  it('reconnaît l\'en-tête anglais et le texte de timeout anglais', () => {
    expect(r.format).toBe('tracert');
    expect(r.target).toBe('example.com');
    expect(r.maxHops).toBe(30);
    expect(r.hops).toHaveLength(4);
    expect(r.hops[1]!.timeout).toBe(true);
    expect(r.hops[2]!.private).toBe(true);
  });
});

describe('traceroute (Linux)', () => {
  const r = parseTraceroute(TRACEROUTE_LINUX);

  it('reconnaît le format, l\'en-tête et les formes « nom (ip) »', () => {
    expect(r.format).toBe('traceroute');
    expect(r.target).toBe('example.com');
    expect(r.destIp).toBe('93.184.216.34');
    expect(r.maxHops).toBe(30);
    expect(r.hops).toHaveLength(5);
  });

  it('lit les latences à décimales et le saut muet', () => {
    expect(r.hops[0]!.host).toBe('_gateway');
    expect(r.hops[0]!.ip).toBe('192.168.1.1');
    expect(r.hops[0]!.rttMs).toEqual([0.512, 0.436, 0.401]);
    expect(r.hops[2]!.timeout).toBe(true);
    expect(r.hops[3]!.host).toBe('ae-1.example.net');
  });
});

describe('mtr --report', () => {
  const r = parseTraceroute(MTR_REPORT);

  it('reconnaît le format et l\'hôte', () => {
    expect(r.format).toBe('mtr');
    expect(r.target).toBe('myhost');
    expect(r.hops).toHaveLength(5);
  });

  it('lit la colonne « Last » comme latence', () => {
    expect(r.hops[0]!.host).toBe('_gateway');
    expect(r.hops[0]!.ip).toBeNull();
    expect(r.hops[0]!.rttMs).toEqual([0.5]);
    expect(r.hops[1]!.ip).toBe('80.15.224.25');
    expect(r.hops[1]!.rttMs).toEqual([4.5]);
  });

  it('traite `???` à 100 % de perte comme un saut muet', () => {
    const h3 = r.hops[2]!;
    expect(h3.timeout).toBe(true);
    expect(h3.ip).toBeNull();
  });
});

describe('tracepath (ChromeOS crosh)', () => {
  const r = parseTraceroute(TRACEPATH);

  it('reconnaît le format', () => {
    expect(r.format).toBe('tracepath');
  });

  it('déduplique les TTL répétés en gardant la latence la plus faible', () => {
    expect(r.hops.map((h) => h.ttl)).toEqual([1, 2, 3, 4, 5]);
    expect(r.hops[0]!.rttMs).toEqual([0.412]);
    expect(r.hops[1]!.rttMs).toEqual([4.412]);
  });

  it('ignore la ligne MTU, retire `pmtu`/`asymm` et garde les IP', () => {
    expect(r.hops[0]!.ip).toBe('192.168.1.1');
    expect(r.hops[2]!.ip).toBe('193.252.103.241');
    expect(r.hops[4]!.ip).toBe('154.54.38.157');
  });

  it('marque `no reply` en timeout', () => {
    expect(r.hops[3]!.timeout).toBe(true);
    expect(r.hops[3]!.ip).toBeNull();
  });
});

describe('robustesse', () => {
  it('tolère un prompt en fin de sortie et les lignes vides', () => {
    const r = parseTraceroute(`${TRACERT_FR}\nPS C:\\Users\\Jema>\n`);
    expect(r.hops).toHaveLength(18);
  });

  it('signale un texte vide plutôt que de jeter', () => {
    const r = parseTraceroute('');
    expect(r.hops).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
