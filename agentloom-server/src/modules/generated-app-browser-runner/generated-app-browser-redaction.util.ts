/**
 * browser-runner 写进 Gate 5 结果的文本（console、请求路径、失败原因）在离开 runner 前脱敏：
 * 验收令牌在有效期内可以读写该应用的公开页，宿主绝对路径暴露容器布局，二者都不能进入
 * 创建者可见的门禁证据。
 */

const TOKEN_PLACEHOLDER = '<acceptance-token>';
const PATH_PLACEHOLDER = '<path>';

/** 只匹配位于开头或分隔符之后的宿主绝对路径，避免误伤 URL 中的 `/api/v1/...` 等路径段 */
const HOST_PATH_PATTERN =
  /(^|[\s'"(=:,[])(?:file:\/\/)?\/(?:root|home|app|build|tmp|var|usr|opt|etc|proc|ms-playwright)(?:\/[^\s'"),\]]*)?/g;

export function redactBrowserText(
  value: string,
  acceptanceToken: string,
  maxLength: number,
): string {
  let redacted = value;
  if (acceptanceToken.length > 0) {
    redacted = redacted.split(acceptanceToken).join(TOKEN_PLACEHOLDER);
  }
  redacted = redacted.replace(HOST_PATH_PATTERN, `$1${PATH_PLACEHOLDER}`);
  return redacted.length > maxLength
    ? `${redacted.slice(0, Math.max(0, maxLength - 1))}…`
    : redacted;
}

/** 请求只保留去掉查询串的路径，再按 {@link redactBrowserText} 脱敏 */
export function redactRequestPath(
  url: string,
  acceptanceToken: string,
  maxLength: number,
): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split(/[?#]/, 1)[0] ?? '';
  }
  return redactBrowserText(pathname, acceptanceToken, maxLength);
}
