import { parseTraceroute } from "./packages/traceroute-parse/src/index.ts";
const mangled = "TRACEROUTE google.fr [172.217.18.9 9]  3  1 192.168.1.1 2 80.15.22 4.25 92.184.150.30 4 193.252.1 03.24 1 5 *  6 72.14.20 3.56 7 172,217.18.9 9  Trace completed.";
const r = parseTraceroute(mangled);
console.log(JSON.stringify({ target: r.target, destIp: r.destIp, hops: r.hops.map(h => [h.ttl, h.ip]), warnings: r.warnings }, null, 1));
