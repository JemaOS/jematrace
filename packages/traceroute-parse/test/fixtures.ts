/**
 * Sorties réelles servant de fixtures de test.
 * La première est la sortie `tracert` FR d'un vrai poste Windows.
 */

export const TRACERT_FR = String.raw`Détermination de l’itinéraire vers exemple.com [103.224.182.245]
avec un maximum de 30 sauts :

  1     3 ms     3 ms     3 ms  192.168.1.1
  2     6 ms     5 ms     4 ms  203.0.113.25
  3     8 ms     8 ms     7 ms  203.0.113.30
  4     7 ms     7 ms    10 ms  ae43-0.nimar202.rbci.orange.net [193.252.103.241]
  5    17 ms    20 ms    17 ms  193.252.137.54
  6     *        *        *     Délai d’attente de la demande dépassé.
  7    24 ms    28 ms    19 ms  be3184.ccr42.par01.atlas.cogentco.com [154.54.38.157]
  8    97 ms    95 ms    94 ms  port-channel2813.ccr92.dca04.atlas.cogentco.com [154.54.82.2]
  9   113 ms   111 ms   111 ms  be3483.ccr42.atl01.atlas.cogentco.com [154.54.172.170]
 10   238 ms   201 ms   203 ms  port-channel3704.ccr92.jan02.atlas.cogentco.com [154.54.40.110]
 11   181 ms   130 ms   138 ms  be8122.ccr32.dfw01.atlas.cogentco.com [154.54.41.53]
 12   155 ms   155 ms   220 ms  be3846.ccr22.elp02.atlas.cogentco.com [154.54.165.30]
 13   276 ms   203 ms   156 ms  be5473.ccr32.phx01.atlas.cogentco.com [154.54.166.70]
 14   183 ms   155 ms   197 ms  be4725.rcr62.san01.atlas.cogentco.com [154.54.86.61]
 15   206 ms   201 ms   156 ms  be8977.nr61.b022887-0.san01.atlas.cogentco.com [154.24.25.146]
 16   218 ms   204 ms   202 ms  38.140.111.58
 17   241 ms   160 ms   245 ms  sw02-te2-san.trellian.com [103.224.213.218]
 18   158 ms   156 ms   155 ms  lb-182-245.above.com [103.224.182.245]
Itinéraire déterminé.`;

export const TRACERT_EN = String.raw`Tracing route to example.com [93.184.216.34]
over a maximum of 30 hops:

  1     1 ms     1 ms     1 ms  192.168.1.1
  2     *        *        *     Request timed out.
  3     8 ms     7 ms     9 ms  10.0.0.1
  4    12 ms    11 ms    12 ms  93.184.216.34

Trace complete.`;

export const TRACEROUTE_LINUX = String.raw`traceroute to example.com (93.184.216.34), 30 hops max, 60 byte packets
 1  _gateway (192.168.1.1)  0.512 ms  0.436 ms  0.401 ms
 2  10.0.0.1 (10.0.0.1)  3.512 ms  3.401 ms  3.330 ms
 3  * * *
 4  ae-1.example.net (203.0.113.1)  8.456 ms  8.301 ms  8.220 ms
 5  93.184.216.34 (93.184.216.34)  14.200 ms  14.100 ms  14.050 ms`;

export const MTR_REPORT = String.raw`Start: 2026-10-17T20:00:00+0000
HOST: myhost                       Loss%   Snt   Last   Avg  Best  Wrst StDev
  1.|-- _gateway                    0.0%    10    0.5   0.6   0.4   1.2   0.2
  2.|-- 203.0.113.25                 0.0%    10    4.5   4.8   4.1   6.0   0.5
  3.|-- ???                         100.0%    10    0.0   0.0   0.0   0.0   0.0
  4.|-- ae43-0.nimar202.rbci.orange.net  0.0%    10    7.0   7.2   6.8   8.0   0.3
  5.|-- 103.224.182.245              0.0%    10  158.0 158.2 157.5 160.1   0.9`;

export const TRACEPATH = String.raw` 1?: [LOCALHOST]                                         pmtu 1500
 1:  192.168.1.1                                           0.512ms
 1:  192.168.1.1                                           0.412ms
 2:  203.0.113.25                                          4.512ms
 2:  203.0.113.25                                          4.412ms
 3:  193.252.103.241                                       7.500ms pmtu 1492
 3:  193.252.103.241                                       7.400ms asymm 4
 4:  no reply
 5:  154.54.38.157                                         19.000ms
     Resume: pmtu 1492`;
