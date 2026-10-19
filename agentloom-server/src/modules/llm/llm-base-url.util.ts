/**
 * LLM 提供商 baseUrl 路径拼接工具。
 *
 * 用户填写的 baseUrl 可能带也可能不带版本段（`https://x` / `https://x/v1` / `https://x/v1/`），
 * 推理、连接探测、模型发现、sandbox 配置生成必须用同一套幂等规则拼接，避免出现 `/v1/v1`。
 */

export function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/** baseUrl（忽略尾部斜杠与大小写）是否已以 suffix 结尾。 */
export function hasTerminalPath(baseUrl: string, suffix: string): boolean {
  return trimTrailingSlashes(baseUrl)
    .toLowerCase()
    .endsWith(trimTrailingSlashes(suffix).toLowerCase());
}

/** 幂等追加末段：已以 suffix 结尾时只去掉尾部斜杠。 */
export function appendTerminalPath(baseUrl: string, suffix: string): string {
  const trimmedBaseUrl = trimTrailingSlashes(baseUrl);
  if (hasTerminalPath(trimmedBaseUrl, suffix)) {
    return trimmedBaseUrl;
  }

  return `${trimmedBaseUrl}${suffix}`;
}

/** 去掉末段 suffix（不存在时只去掉尾部斜杠）。 */
export function stripTerminalPath(baseUrl: string, suffix: string): string {
  const trimmedBaseUrl = trimTrailingSlashes(baseUrl);
  if (!hasTerminalPath(trimmedBaseUrl, suffix)) {
    return trimmedBaseUrl;
  }

  const normalizedSuffix = trimTrailingSlashes(suffix);
  return trimmedBaseUrl.slice(0, -normalizedSuffix.length) || trimmedBaseUrl;
}
