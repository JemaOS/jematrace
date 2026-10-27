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
    for (const ip of ['8.8.8.8', '203.0.113.25', '172.32.0.1', '192.169.1.1', '2606:4700::1111']) {
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
    expect(r.hops[1]!.ip).toBe('203.0.113.25');
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

describe('traceroute Linux réel (multipath, en-tête abîmé, CGNAT)', () => {
  // Cas réel : le « tr » de « traceroute » a été mangé par le collage, le saut 8
  // contient deux répondeurs (ECMP), et les sauts 1-2 sont en 100.64/10 (CGNAT).
  const LINUX = `aceroute to youtube.com (142.251.209.78), 30 hops max, 60 byte packets
 1  _gateway (100.115.92.193)  0.021 ms  0.008 ms  0.006 ms
 2  100.115.92.25 (100.115.92.25)  0.265 ms  0.226 ms  0.534 ms
 3  192.168.1.1 (192.168.1.1)  3.163 ms  3.140 ms  3.119 ms
 4  203.0.113.25 (203.0.113.25)  16.321 ms  16.300 ms  16.279 ms
 5  203.0.113.30 (203.0.113.30)  16.258 ms  16.238 ms  16.217 ms
 6  ae43-0.nimar202.rbci.orange.net (193.252.103.241)  16.196 ms  14.870 ms  16.602 ms
 7  * * *
 8  72.14.203.56 (72.14.203.56)  16.470 ms 72.14.197.198 (72.14.197.198)  8.744 ms *
 9  ncmrsa-ai-in-f14.1e100.net (142.251.209.78)  12.654 ms  19.170 ms  14.019 ms`;

  const r = parseTraceroute(LINUX);

  it('reconnaît le format malgré l’en-tête tronqué', () => {
    expect(r.format).toBe('traceroute');
    expect(r.target).toBe('youtube.com');
    expect(r.destIp).toBe('142.251.209.78');
    expect(r.maxHops).toBe(30);
    expect(r.warnings).toEqual([]);
  });

  it('lit les 9 sauts et garde le saut muet', () => {
    expect(r.hops.map((h) => h.ttl)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.hops[6]).toMatchObject({ ip: null, timeout: true });
  });

  it('prend le premier répondeur d’une ligne multipath, sans nom parasite', () => {
    const hop8 = r.hops[7]!;
    expect(hop8.ip).toBe('72.14.203.56');
    // Avant, le « nom » valait « 72.14.203.56 (72.14.203.56) 72.14.197.198 ».
    expect(hop8.host).toBeNull();
    expect(hop8.rttMs).toEqual([16.47, 8.744]);
  });

  it('traite le CGNAT 100.64/10 comme un réseau non géolocalisable', () => {
    expect(r.hops[0]!.private).toBe(true);
    expect(r.hops[0]!.host).toBe('_gateway');
    expect(r.hops[1]!.private).toBe(true);
    expect(r.hops[2]!.private).toBe(true);
    expect(r.hops[3]!.private).toBe(false);
  });
});

describe('tracepath crosh (sortie réelle)', () => {
  const REAL = `crosh> tracepath youtube.com
 1?: [LOCALHOST]                      pmtu 1500
 1:  livebox.home                                          3.456ms
 1:  livebox.home                                          3.139ms
 2:  no reply
 3:  203.0.113.30                                         7.511ms
 4:  ae43-0.nimar202.rbci.orange.net                       8.622ms asymm  5
 5:  no reply
 6:  






72.14.203.56                                          9.501ms asymm  7
 7:  no reply
 8:  no reply
30:  no reply
     Too many hops: pmtu 1500
     Resume: pmtu 1500
crosh>`;

  const r = parseTraceroute(REAL);

  it('lit la cible dans la ligne de commande', () => {
    expect(r.format).toBe('tracepath');
    expect(r.target).toBe('youtube.com');
  });

  it('rattache une IP détachée sur plusieurs lignes au bon saut', () => {
    const hop6 = r.hops.find((h) => h.ttl === 6);
    expect(hop6).toMatchObject({ ip: '72.14.203.56', rttMs: [9.501], timeout: false });
    // et elle ne doit pas avoir été prise pour le saut 7.
    expect(r.hops.find((h) => h.ttl === 7)?.ip).toBeNull();
  });

  it('garde le nom seul quand il n’y a pas d’IP (saut 4)', () => {
    const hop4 = r.hops.find((h) => h.ttl === 4);
    expect(hop4?.host).toBe('ae43-0.nimar202.rbci.orange.net');
    expect(hop4?.ip).toBeNull();
    expect(hop4?.rttMs).toEqual([8.622]);
  });

  it('ne prend pas « Too many hops » pour un saut', () => {
    expect(r.hops.map((h) => h.ttl)).not.toContain(31);
    expect(r.hops).toHaveLength(9); // 1,2,3,4,5,6,7,8,30
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

  it('reconstitue une sortie aplatie par un copier-coller mobile', () => {
    // Cas réel : une seule ligne, IP coupées par des espaces, une virgule à la
    // place d'un point, latences perdues et un numéro de saut décalé.
    const mangled =
      'TRACEROUTE google.fr [172.217.18.9 9]  3  1 192.168.1.1 2 203.0.11 3.25 ' +
      '203.0.113.30 4 193.252.1 03.24 1 5 *  6 72.14.20 3.56 7 172,217.18.9 9  Trace completed.';

    const r = parseTraceroute(mangled);

    expect(r.target).toBe('google.fr');
    expect(r.destIp).toBe('172.217.18.99');
    expect(r.hops.map((h) => h.ttl)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.hops.map((h) => h.ip)).toEqual([
      '192.168.1.1',
      '203.0.113.25',
      '203.0.113.30',
      '193.252.103.241',
      null,
      '72.14.203.56',
      '172.217.18.99',
    ]);
    // Saut muet conservé, pas de latence inventée.
    expect(r.hops[4]!.timeout).toBe(true);
    expect(r.hops[1]!.rttMs).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/copier-coller/);
  });

  it('ne fusionne pas un numéro de saut avec l\'IP qui suit', () => {
    // « 1 1.2.3.4 » doit rester le saut 1 → 1.2.3.4, et non 11.2.3.4.
    const r = parseTraceroute('TRACEROUTE exemple.fr [9.9.9.9] 1 1.2.3.4 2 5.6.7.8');
    expect(r.hops.map((h) => h.ttl)).toEqual([1, 2]);
    expect(r.hops[0]!.ip).toBe('1.2.3.4');
    expect(r.hops[1]!.ip).toBe('5.6.7.8');
  });

  it('remet les sauts dans l’ordre quand les numéros ont été détachés des IP', () => {
    // Collage réel : les numéros de saut sont regroupés en tête (« 1 6 7 8 9 »),
    // les IP suivent dans le bon ordre, et la cible contient une virgule.
    const mangled =
      "TRACEROUTE Alibaba. com [47,246,136.253]  1  6 7 8' 9  \u3001  192.168.1.1 2  " +
      '203.0.11 3.25 39 203.0.113.30  193.252.1 03.24 1 51 193.252.137.54  ' +
      '154.54.38.157 154.54.88.218 *  10  11 12 13  * * *  47.246.136.253  Trace completed.';

    const r = parseTraceroute(mangled);

    expect(r.target).toBe('Alibaba.com');
    expect(r.destIp).toBe('47.246.136.253');

    // Les numéros de saut étant incohérents, on numérote dans l'ordre des IP.
    expect(r.hops.map((h) => h.ip)).toEqual([
      '192.168.1.1',
      '203.0.113.25',
      '203.0.113.30',
      '193.252.103.241',
      '193.252.137.54',
      '154.54.38.157',
      '154.54.88.218',
      '47.246.136.253',
    ]);
    expect(r.hops.map((h) => h.ttl)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // La dernière IP de la sortie doit rester le dernier saut.
    expect(r.hops.at(-1)!.ip).toBe('47.246.136.253');
  });

  it('conserve les numéros de saut quand ils sont cohérents', () => {
    // Ici les TTL collent aux IP : on garde la numérotation d'origine, trous
    // compris (le saut 5 n'a pas répondu).
    const r = parseTraceroute(
      'TRACEROUTE google.fr [172.217.18.9 9] 1 192.168.1.1 2 203.0.11 3.25 ' +
        '203.0.113.30 4 193.252.1 03.24 1 5 * 6 72.14.20 3.56 7 172,217.18.9 9',
    );
    expect(r.hops.map((h) => h.ttl)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.hops[4]!.ip).toBeNull();
  });

  it('laisse les formats valides intacts', () => {
    // Le filet de sécurité ne doit jamais s'activer sur une sortie correcte.
    const r = parseTraceroute(TRACERT_FR);
    expect(r.warnings).toEqual([]);
    expect(r.hops).toHaveLength(18);
  });
});

describe('rapport tabulaire', () => {
  const REPORT = `=========================================
RAPPORT DE TRAÇAGE RÉSEAU
Cible : alibaba.com (47.246.137.105)
Date : 19 oct. 2026 01:18
Nombre total de sauts : 13
=========================================

SAUT IP                 PING       PAYS             NOM D’HÔTE
--------------------------------------------------------------------------------
1    192.168.1.1        12.4 ms    Réseau local     -
2    203.0.113.25       9.9 ms     France           -
3    203.0.113.30      * * *      France           -
4    193.252.103.241    * * *      France           -
5    193.252.137.54     32.6 ms    France           -
6                       * * *      Inconnu          -
7    154.54.38.157      * * *      États-Unis       -
8    154.54.88.218      * * *      États-Unis       -
9                       * * *      Inconnu          -
10                      * * *      Inconnu          -
11                      * * *      Inconnu          -
12                      * * *      Inconnu          -
13   47.246.137.105     114.5 ms   États-Unis       -
`;

  const r = parseTraceroute(REPORT);

  it('reconnaît le format et la cible', () => {
    expect(r.format).toBe('report');
    expect(r.target).toBe('alibaba.com');
    expect(r.destIp).toBe('47.246.137.105');
    expect(r.maxHops).toBe(13);
    expect(r.warnings).toEqual([]);
  });

  it('lit les 13 sauts, dans l’ordre, sans en perdre', () => {
    expect(r.hops.map((h) => h.ttl)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
  });

  it('extrait les IP et les latences des lignes renseignées', () => {
    expect(r.hops[0]).toMatchObject({ ip: '192.168.1.1', rttMs: [12.4], private: true, timeout: false });
    expect(r.hops[1]).toMatchObject({ ip: '203.0.113.25', rttMs: [9.9], timeout: false });
    expect(r.hops[4]).toMatchObject({ ip: '193.252.137.54', rttMs: [32.6] });
    expect(r.hops[12]).toMatchObject({ ip: '47.246.137.105', rttMs: [114.5] });
  });

  it('garde les sauts muets à leur place', () => {
    // « * * * » avec IP connue et sans IP.
    expect(r.hops[2]).toMatchObject({ ip: '203.0.113.30', rttMs: [], timeout: true });
    expect(r.hops[5]).toMatchObject({ ip: null, rttMs: [], timeout: true });
    expect(r.hops[8]!.ttl).toBe(9);
    expect(r.hops[8]!.timeout).toBe(true);
  });
});
