import { isIPv4, isIPv6 } from 'node:net';

/** Expands an IPv6 address to its eight 16-bit groups, or returns null if it cannot be parsed. */
function ipv6Groups(ip: string): number[] | null {
  let addr = ip.split('%')[0].toLowerCase();
  // a trailing dotted IPv4 (e.g. ::ffff:1.2.3.4) becomes two groups
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const o = v4[1].split('.').map(Number);
    addr = addr.slice(0, -v4[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const [head, tail, ...rest] = addr.split('::');
  if (rest.length) return null;
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : null;
  const groups = t === null ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  if (groups.length !== 8) return null;
  const nums = groups.map(g => parseInt(g, 16));
  return nums.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? nums : null;
}

/**
 * Rate-limit identity for a client address. One IPv6 host usually controls a whole /64 (often a /56 or /48),
 * so `host` is the /64 prefix and `wide` the /48 for a coarser second bucket; IPv4 (and IPv4-mapped IPv6) uses the address.
 */
export function clientKey(ip: string | undefined): { host: string; wide: string | null } {
  const raw = String(ip ?? '');
  if (isIPv4(raw)) return { host: raw, wide: null };
  if (!isIPv6(raw)) return { host: raw, wide: null };
  const g = ipv6Groups(raw);
  if (!g) return { host: raw, wide: null };
  // ::ffff:a.b.c.d is an IPv4 client seen through a dual-stack socket
  if (g.slice(0, 5).every(n => n === 0) && g[5] === 0xffff) {
    return { host: [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.'), wide: null };
  }
  const hex = (n: number) => n.toString(16);
  return { host: g.slice(0, 4).map(hex).join(':') + '::/64', wide: g.slice(0, 3).map(hex).join(':') + '::/48' };
}
