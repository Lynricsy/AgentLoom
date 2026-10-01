import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 校验 GitHub webhook 的 `X-Hub-Signature-256: sha256=<hex>`：
 * HMAC-SHA256(secret, 原始请求体)，常量时间比较。
 * webhook 触发器（authMode 'github'）与 api_event 的 GitHub adapter 共用这一实现。
 */
export function isValidGithubSignature(
  secret: string,
  rawBody: string | Buffer,
  signatureHeader: string,
): boolean {
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
    'utf8',
  );
  const provided = Buffer.from(signatureHeader, 'utf8');

  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}
