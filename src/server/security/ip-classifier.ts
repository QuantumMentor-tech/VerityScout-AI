import 'server-only';
import net from 'node:net';

/**
 * VerityScout AI — IP Address Classification & Non-Public Range Blocking
 * Governed by: Step 32 (Safe URL Validation, SSRF Prevention, Redirect Protection, and Network Destination Controls)
 *
 * Implements strict RFC-compliant IP address categorization for IPv4 and IPv6:
 * - RFC 1122: Loopback (127.0.0.0/8), "This" Network (0.0.0.0/8)
 * - RFC 1918: Private-Use Networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - RFC 3927: Link-Local (169.254.0.0/16) — includes Cloud Metadata Services (169.254.169.254)
 * - RFC 6598: Shared Address Space / CGNAT (100.64.0.0/10)
 * - RFC 5737: Documentation / TEST-NETs (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
 * - RFC 2544: Benchmarking (198.18.0.0/15)
 * - RFC 5771: Multicast (224.0.0.0/4)
 * - RFC 1112: Reserved (240.0.0.0/4)
 * - RFC 919:  Limited Broadcast (255.255.255.255/32)
 * - RFC 4291: IPv6 Unspecified (::/128), Loopback (::1/128), Link-Local (fe80::/10), Multicast (ff00::/8), IPv4-mapped (::ffff:0:0/96)
 * - RFC 4193: IPv6 Unique Local (fc00::/7)
 * - RFC 3849: IPv6 Documentation (2001:db8::/32)
 * - RFC 3056: IPv6 6to4 Encapsulation (2002::/16)
 * - RFC 6666: IPv6 Discard Prefix (100::/64)
 * - RFC 6052: IPv4/IPv6 Translation NAT64 (64:ff9b::/96)
 */

export interface IpClassificationResult {
  readonly ip: string;
  readonly family: 4 | 6;
  readonly isPublic: boolean;
  readonly category: string;
  readonly embeddedIpv4?: string;
  readonly reason?: string;
}

interface Ipv4Range {
  readonly name: string;
  readonly network: number;
  readonly mask: number;
}

interface Ipv6Range {
  readonly name: string;
  readonly network: bigint;
  readonly mask: bigint;
}

function parseIpv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const part = parts[i];
    if (part === undefined || !/^\d+$/.test(part)) return null;
    const octet = parseInt(part, 10);
    if (octet < 0 || octet > 255) return null;
    num = (num << 8) | octet;
  }
  return num >>> 0;
}

function createIpv4Cidr(cidr: string, name: string): Ipv4Range {
  const [networkStr, prefixStr] = cidr.split('/');
  if (!networkStr || !prefixStr) throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  const network = parseIpv4ToNumber(networkStr);
  if (network === null) throw new Error(`Invalid IPv4 address in CIDR: ${cidr}`);
  const prefix = parseInt(prefixStr, 10);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { name, network: (network & mask) >>> 0, mask };
}

const PROHIBITED_IPV4_RANGES: readonly Ipv4Range[] = [
  createIpv4Cidr('0.0.0.0/8', 'This Host / Unspecified Network (RFC 1122)'),
  createIpv4Cidr('10.0.0.0/8', 'Private-Use Network (RFC 1918)'),
  createIpv4Cidr('100.64.0.0/10', 'Shared Address Space / CGNAT (RFC 6598)'),
  createIpv4Cidr('127.0.0.0/8', 'Loopback Network (RFC 1122)'),
  createIpv4Cidr('169.254.0.0/16', 'Link-Local / Cloud Metadata (RFC 3927)'),
  createIpv4Cidr('172.16.0.0/12', 'Private-Use Network (RFC 1918)'),
  createIpv4Cidr('192.0.0.0/24', 'IETF Protocol Assignments (RFC 6890)'),
  createIpv4Cidr('192.0.2.0/24', 'Documentation TEST-NET-1 (RFC 5737)'),
  createIpv4Cidr('192.88.99.0/24', '6to4 Relay Anycast (RFC 3068 / RFC 7526)'),
  createIpv4Cidr('192.168.0.0/16', 'Private-Use Network (RFC 1918)'),
  createIpv4Cidr('198.18.0.0/15', 'Benchmarking Network (RFC 2544)'),
  createIpv4Cidr('198.51.100.0/24', 'Documentation TEST-NET-2 (RFC 5737)'),
  createIpv4Cidr('203.0.113.0/24', 'Documentation TEST-NET-3 (RFC 5737)'),
  createIpv4Cidr('224.0.0.0/4', 'Multicast Network (RFC 5771)'),
  createIpv4Cidr('240.0.0.0/4', 'Reserved for Future Use (RFC 1112)'),
  createIpv4Cidr('255.255.255.255/32', 'Limited Broadcast (RFC 919)'),
];

function parseIpv6ToBigInt(ip: string): bigint | null {
  // Strip optional zone index (e.g. fe80::1%eth0)
  let cleanIp = ip.split('%')[0] ?? '';

  // Handle IPv4-mapped notation at the end (e.g. ::ffff:192.168.1.1)
  const lastColon = cleanIp.lastIndexOf(':');
  if (lastColon !== -1) {
    const potentialIpv4 = cleanIp.substring(lastColon + 1);
    if (potentialIpv4.includes('.')) {
      const v4Num = parseIpv4ToNumber(potentialIpv4);
      if (v4Num === null) return null;
      const hex1 = ((v4Num >>> 16) & 0xffff).toString(16);
      const hex2 = (v4Num & 0xffff).toString(16);
      cleanIp = `${cleanIp.substring(0, lastColon)}:${hex1}:${hex2}`;
    }
  }

  // Check for '::'
  let parts: string[];
  if (cleanIp.includes('::')) {
    if (cleanIp.indexOf('::') !== cleanIp.lastIndexOf('::')) {
      // More than one double colon is invalid
      return null;
    }
    const [head, tail] = cleanIp.split('::');
    const headParts = head && head.length > 0 ? head.split(':') : [];
    const tailParts = tail && tail.length > 0 ? tail.split(':') : [];

    if (headParts.length + tailParts.length > 7) {
      return null;
    }

    const missingZeros = 8 - (headParts.length + tailParts.length);
    const zeroParts = Array.from({ length: missingZeros }, () => '0');
    parts = [...headParts, ...zeroParts, ...tailParts];
  } else {
    parts = cleanIp.split(':');
  }

  if (parts.length !== 8) return null;

  let result = 0n;
  for (let i = 0; i < 8; i++) {
    const part = parts[i];
    if (part === undefined || !/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
    const hexVal = BigInt(parseInt(part, 16));
    result = (result << 16n) | hexVal;
  }

  return result;
}

function createIpv6Cidr(cidr: string, name: string): Ipv6Range {
  const [networkStr, prefixStr] = cidr.split('/');
  if (!networkStr || !prefixStr) throw new Error(`Invalid IPv6 CIDR: ${cidr}`);
  const network = parseIpv6ToBigInt(networkStr);
  if (network === null) throw new Error(`Invalid IPv6 address in CIDR: ${cidr}`);
  const prefix = BigInt(prefixStr);
  const mask = prefix === 0n ? 0n : (~0n << (128n - prefix)) & ((1n << 128n) - 1n);
  return { name, network: network & mask, mask };
}

const PROHIBITED_IPV6_RANGES: readonly Ipv6Range[] = [
  createIpv6Cidr('::/128', 'IPv6 Unspecified Address (RFC 4291)'),
  createIpv6Cidr('::1/128', 'IPv6 Loopback Address (RFC 4291)'),
  createIpv6Cidr('100::/64', 'IPv6 Discard-Only Prefix (RFC 6666)'),
  createIpv6Cidr('2001:db8::/32', 'IPv6 Documentation Network (RFC 3849)'),
  createIpv6Cidr('fc00::/7', 'IPv6 Unique Local Address / ULA (RFC 4193)'),
  createIpv6Cidr('fe80::/10', 'IPv6 Link-Local Unicast (RFC 4291)'),
  createIpv6Cidr('ff00::/8', 'IPv6 Multicast Address (RFC 4291)'),
];

/**
 * Classifies an IPv4 address string against all prohibited and special-purpose address spaces.
 */
export function classifyIpv4Address(ip: string): IpClassificationResult {
  const num = parseIpv4ToNumber(ip);
  if (num === null) {
    return {
      ip,
      family: 4,
      isPublic: false,
      category: 'INVALID_IPV4',
      reason: 'Malformed IPv4 address notation',
    };
  }

  for (const range of PROHIBITED_IPV4_RANGES) {
    if ((num & range.mask) >>> 0 === range.network) {
      return {
        ip,
        family: 4,
        isPublic: false,
        category: range.name,
        reason: `Destination IP ${ip} falls within non-public address range: ${range.name}`,
      };
    }
  }

  return {
    ip,
    family: 4,
    isPublic: true,
    category: 'PUBLIC_IPV4',
  };
}

/**
 * Classifies an IPv6 address string against all prohibited and special-purpose address spaces,
 * including embedded IPv4 extraction (IPv4-mapped, 6to4, NAT64).
 */
export function classifyIpv6Address(ip: string): IpClassificationResult {
  // Reject scoped IPv6 with zone identifiers for public research sources (e.g. fe80::1%eth0)
  if (ip.includes('%')) {
    return {
      ip,
      family: 6,
      isPublic: false,
      category: 'SCOPED_IPV6',
      reason: 'Scoped IPv6 addresses with zone identifiers are prohibited for public source fetching',
    };
  }

  const num = parseIpv6ToBigInt(ip);
  if (num === null) {
    return {
      ip,
      family: 6,
      isPublic: false,
      category: 'INVALID_IPV6',
      reason: 'Malformed IPv6 address notation',
    };
  }

  // 1. Check IPv4-Mapped IPv6 (::ffff:0:0/96)
  const ipv4MappedMask = (~0n << 32n) & ((1n << 128n) - 1n);
  const ipv4MappedNetwork = 0xffffn << 32n;
  if ((num & ipv4MappedMask) === ipv4MappedNetwork) {
    const embeddedV4Num = Number(num & 0xffffffffn);
    const embeddedV4Str = [
      (embeddedV4Num >>> 24) & 0xff,
      (embeddedV4Num >>> 16) & 0xff,
      (embeddedV4Num >>> 8) & 0xff,
      embeddedV4Num & 0xff,
    ].join('.');

    const v4Result = classifyIpv4Address(embeddedV4Str);
    if (!v4Result.isPublic) {
      return {
        ip,
        family: 6,
        isPublic: false,
        category: `IPv4-Mapped ${v4Result.category}`,
        embeddedIpv4: embeddedV4Str,
        reason: `IPv4-mapped IPv6 destination embeds prohibited IPv4 (${embeddedV4Str}): ${v4Result.reason}`,
      };
    }

    return {
      ip,
      family: 6,
      isPublic: true,
      category: 'PUBLIC_IPV4_MAPPED_IPV6',
      embeddedIpv4: embeddedV4Str,
    };
  }

  // 2. Check 6to4 Encapsulation (2002::/16)
  const sixToFourMask = 0xffffn << 112n;
  const sixToFourNetwork = 0x2002n << 112n;
  if ((num & sixToFourMask) === sixToFourNetwork) {
    const embeddedV4Num = Number((num >> 80n) & 0xffffffffn);
    const embeddedV4Str = [
      (embeddedV4Num >>> 24) & 0xff,
      (embeddedV4Num >>> 16) & 0xff,
      (embeddedV4Num >>> 8) & 0xff,
      embeddedV4Num & 0xff,
    ].join('.');

    const v4Result = classifyIpv4Address(embeddedV4Str);
    if (!v4Result.isPublic) {
      return {
        ip,
        family: 6,
        isPublic: false,
        category: `6to4 Embedded ${v4Result.category}`,
        embeddedIpv4: embeddedV4Str,
        reason: `6to4 IPv6 destination embeds prohibited IPv4 (${embeddedV4Str}): ${v4Result.reason}`,
      };
    }
  }

  // 3. Check NAT64 Prefix (64:ff9b::/96)
  const nat64Mask = (~0n << 32n) & ((1n << 128n) - 1n);
  const nat64Network = (0x0064n << 112n) | (0xff9bn << 96n);
  if ((num & nat64Mask) === nat64Network) {
    const embeddedV4Num = Number(num & 0xffffffffn);
    const embeddedV4Str = [
      (embeddedV4Num >>> 24) & 0xff,
      (embeddedV4Num >>> 16) & 0xff,
      (embeddedV4Num >>> 8) & 0xff,
      embeddedV4Num & 0xff,
    ].join('.');

    const v4Result = classifyIpv4Address(embeddedV4Str);
    if (!v4Result.isPublic) {
      return {
        ip,
        family: 6,
        isPublic: false,
        category: `NAT64 Embedded ${v4Result.category}`,
        embeddedIpv4: embeddedV4Str,
        reason: `NAT64 IPv6 destination embeds prohibited IPv4 (${embeddedV4Str}): ${v4Result.reason}`,
      };
    }
  }

  // 4. Check Prohibited IPv6 Ranges
  for (const range of PROHIBITED_IPV6_RANGES) {
    if ((num & range.mask) === range.network) {
      return {
        ip,
        family: 6,
        isPublic: false,
        category: range.name,
        reason: `Destination IPv6 ${ip} falls within prohibited address range: ${range.name}`,
      };
    }
  }

  return {
    ip,
    family: 6,
    isPublic: true,
    category: 'PUBLIC_IPV6',
  };
}

/**
 * Universal IP address classifier for arbitrary IPv4 or IPv6 string.
 */
export function classifyIpAddress(ip: string): IpClassificationResult {
  const clean = ip.trim();
  const family = net.isIP(clean);

  if (family === 4) {
    return classifyIpv4Address(clean);
  }

  if (family === 6) {
    return classifyIpv6Address(clean);
  }

  return {
    ip: clean,
    family: 4,
    isPublic: false,
    category: 'INVALID_IP',
    reason: `Invalid IP address format: "${clean}"`,
  };
}
