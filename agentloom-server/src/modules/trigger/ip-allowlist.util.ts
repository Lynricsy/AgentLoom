import { BlockList, isIP } from 'node:net';

const IPV4_MAPPED_PREFIX = '::ffff:';

type ParsedAllowlistEntry =
  | { kind: 'address'; address: string; family: 'ipv4' | 'ipv6' }
  | {
      kind: 'subnet';
      address: string;
      prefix: number;
      family: 'ipv4' | 'ipv6';
    };

/** IPv4-mapped IPv6（`::ffff:1.2.3.4`）统一折叠为 IPv4，白名单与客户端地址同一口径比较。 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)) {
    const mapped = trimmed.slice(IPV4_MAPPED_PREFIX.length);
    if (isIP(mapped) === 4) {
      return mapped;
    }
  }
  return trimmed;
}

function toFamily(address: string): 'ipv4' | 'ipv6' | null {
  const version = isIP(address);
  if (version === 4) return 'ipv4';
  if (version === 6) return 'ipv6';
  return null;
}

function parseEntry(entry: string): ParsedAllowlistEntry | null {
  const [rawAddress, rawPrefix, ...rest] = entry.trim().split('/');
  if (rest.length > 0 || !rawAddress) {
    return null;
  }

  const address = normalizeIp(rawAddress);
  const family = toFamily(address);
  if (!family) {
    return null;
  }

  if (rawPrefix === undefined) {
    return { kind: 'address', address, family };
  }

  if (!/^\d{1,3}$/.test(rawPrefix)) {
    return null;
  }

  const prefix = Number(rawPrefix);
  const maxPrefix = family === 'ipv4' ? 32 : 128;
  if (prefix > maxPrefix) {
    return null;
  }

  return { kind: 'subnet', address, prefix, family };
}

/** 单个 IP（v4/v6）或 CIDR（`10.0.0.0/8`、`2001:db8::/32`）。 */
export function isValidIpAllowlistEntry(entry: string): boolean {
  return parseEntry(entry) !== null;
}

/**
 * 白名单为空表示不限制。客户端地址缺失或无法解析时一律拒绝（fail-closed）。
 * 非法条目在 DTO 层已被拒绝；历史数据里残留的非法条目直接忽略，不会放行任何地址。
 */
export function isIpAllowed(
  allowlist: readonly string[],
  clientIp: string | undefined,
): boolean {
  if (allowlist.length === 0) {
    return true;
  }

  if (!clientIp) {
    return false;
  }

  const normalizedClientIp = normalizeIp(clientIp);
  const clientFamily = toFamily(normalizedClientIp);
  if (!clientFamily) {
    return false;
  }

  const blockList = new BlockList();
  for (const entry of allowlist) {
    const parsed = parseEntry(entry);
    if (!parsed) continue;

    if (parsed.kind === 'address') {
      blockList.addAddress(parsed.address, parsed.family);
    } else {
      blockList.addSubnet(parsed.address, parsed.prefix, parsed.family);
    }
  }

  return blockList.check(normalizedClientIp, clientFamily);
}
