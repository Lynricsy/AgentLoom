import {
  WebSearchProviderError,
  type WebSearchProviderId,
  type WebSearchRecency,
} from '../web-search.types';

/** 单个后端请求超时（含读取响应体） */
export const WEB_SEARCH_PROVIDER_TIMEOUT_MS = 15_000;

/**
 * 发起后端请求：叠加 15 s 超时；网络错误、超时与非 2xx 统一转为 WebSearchProviderError，
 * 调用方中止（signal 已 aborted）时原样抛出，让回退链停止。
 */
export async function providerFetch(
  id: WebSearchProviderId,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(WEB_SEARCH_PROVIDER_TIMEOUT_MS),
      ]),
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw new WebSearchProviderError(id, describeFetchError(error));
  }
  if (!response.ok) {
    throw new WebSearchProviderError(id, `${response.status}`);
  }
  return response;
}

export async function readProviderJson(
  id: WebSearchProviderId,
  response: Response,
): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new WebSearchProviderError(id, 'invalid JSON response');
  }
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'TimeoutError'
      ? `timeout after ${WEB_SEARCH_PROVIDER_TIMEOUT_MS / 1000}s`
      : error.message;
  }
  return String(error);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity: string, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        return safeFromCodePoint(Number.parseInt(body.slice(2), 16), entity);
      }
      if (body.startsWith('#')) {
        return safeFromCodePoint(Number.parseInt(body.slice(1), 10), entity);
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    },
  );
}

function safeFromCodePoint(codePoint: number, fallback: string): string {
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

/** 去 HTML 标签、解码实体并折叠空白；用于 HTML 片段与带高亮标签的摘要 */
export function cleanHtmlText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

const RECENCY_DAYS: Record<WebSearchRecency, number> = {
  day: 1,
  week: 7,
  month: 31,
  year: 365,
};

/** recency 换算的起始时间（ISO 8601），供只接受绝对日期的后端使用 */
export function recencyStartIso(
  recency: WebSearchRecency,
  now: Date = new Date(),
): string {
  return new Date(
    now.getTime() - RECENCY_DAYS[recency] * 24 * 60 * 60 * 1000,
  ).toISOString();
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}
