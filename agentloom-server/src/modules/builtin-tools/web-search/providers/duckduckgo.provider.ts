import type {
  WebSearchProvider,
  WebSearchProviderResponse,
  WebSearchQuery,
  WebSearchRecency,
  WebSearchResultItem,
} from '../web-search.types';
import { WebSearchProviderError } from '../web-search.types';
import {
  cleanHtmlText,
  decodeHtmlEntities,
  providerFetch,
} from './provider-http';

const DUCKDUCKGO_HTML_ENDPOINT = 'https://html.duckduckgo.com/html/';

/** DDG HTML 端点对非浏览器 UA 更容易返回拦截页，固定一个常见桌面浏览器 UA */
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

const RECENCY_PARAM: Record<WebSearchRecency, string> = {
  day: 'd',
  week: 'w',
  month: 'm',
  year: 'y',
};

const ANCHOR_PATTERN = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;

/** 免 key 后端：抓取 html.duckduckgo.com 的结果页并解析 */
export class DuckDuckGoSearchProvider implements WebSearchProvider {
  readonly id = 'duckduckgo' as const;

  isConfigured(): boolean {
    return true;
  }

  async search(
    query: WebSearchQuery,
    signal: AbortSignal,
  ): Promise<WebSearchProviderResponse> {
    const form = new URLSearchParams({ q: query.query });
    if (query.recency) {
      form.set('df', RECENCY_PARAM[query.recency]);
    }
    const response = await providerFetch(
      this.id,
      DUCKDUCKGO_HTML_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': DESKTOP_USER_AGENT,
          Accept: 'text/html',
        },
        body: form.toString(),
      },
      signal,
    );
    const html = await response.text();
    const results = parseDuckDuckGoHtml(html);
    if (html.includes('anomaly-modal') || results.length === 0) {
      throw new WebSearchProviderError(this.id, 'blocked or empty');
    }
    return { results: results.slice(0, query.limit) };
  }
}

/** 按文档顺序扫描 `result__a`（标题链接）与 `result__snippet`（摘要），后者挂到最近一条结果上 */
export function parseDuckDuckGoHtml(html: string): WebSearchResultItem[] {
  const results: WebSearchResultItem[] = [];
  let current: WebSearchResultItem | undefined;

  for (const match of html.matchAll(ANCHOR_PATTERN)) {
    const attributes = match[1] ?? '';
    const inner = match[2] ?? '';
    const className = readAttribute(attributes, 'class') ?? '';
    const classes = className.split(/\s+/);

    if (classes.includes('result__a')) {
      const url = resolveResultUrl(readAttribute(attributes, 'href'));
      // 广告链接指向 duckduckgo.com/y.js，解析不出真实目标时一并跳过
      current = url
        ? { title: cleanHtmlText(inner), url, snippet: '' }
        : undefined;
      if (current) {
        results.push(current);
      }
      continue;
    }
    if (classes.includes('result__snippet') && current && !current.snippet) {
      current.snippet = cleanHtmlText(inner);
    }
  }
  return results;
}

function readAttribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`,
    'i',
  ).exec(attributes);
  const raw = match?.[2] ?? match?.[3];
  return raw === undefined ? undefined : decodeHtmlEntities(raw);
}

/** DDG 结果链接形如 `//duckduckgo.com/l/?uddg=<编码后的真实 URL>&rut=…` */
function resolveResultUrl(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(href, 'https://duckduckgo.com');
  } catch {
    return undefined;
  }
  const target = parsed.searchParams.get('uddg');
  const candidate = target ?? parsed.toString();
  let resolved: URL;
  try {
    resolved = new URL(candidate);
  } catch {
    return undefined;
  }
  if (
    (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') ||
    resolved.hostname === 'duckduckgo.com' ||
    resolved.hostname.endsWith('.duckduckgo.com')
  ) {
    return undefined;
  }
  return resolved.toString();
}
