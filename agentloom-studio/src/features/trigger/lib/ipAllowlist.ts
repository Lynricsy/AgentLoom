/**
 * Webhook IP 白名单输入的唯一解析/校验口径（触发器对话框与画布节点面板共用）。
 * 语义与 server `ip-allowlist.util.ts` 一致：单个 IPv4/IPv6 或 CIDR 网段。
 */

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

function ipFamily(address: string): 4 | 6 | null {
  if (IPV4_PATTERN.test(address)) {
    return 4
  }

  if (!address.includes(':')) {
    return null
  }

  try {
    // URL 解析器按 RFC 4291 校验 IPv6 字面量；规范化后的 hostname 可能与输入大小写/压缩形式不同
    new URL(`http://[${address}]`)
    return 6
  } catch {
    return null
  }
}

export function isValidIpAllowlistEntry(entry: string): boolean {
  const [address, prefix, ...rest] = entry.trim().split('/')
  if (rest.length > 0 || !address) {
    return false
  }

  const family = ipFamily(address)
  if (family === null) {
    return false
  }

  if (prefix === undefined) {
    return true
  }

  if (!/^\d{1,3}$/.test(prefix)) {
    return false
  }

  return Number(prefix) <= (family === 4 ? 32 : 128)
}

/** 每行一个或逗号分隔均可，空白条目忽略。 */
export function parseIpAllowlist(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
