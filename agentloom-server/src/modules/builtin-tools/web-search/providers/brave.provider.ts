import type {
  WebSearchProvider,
  WebSearchProviderResponse,
  WebSearchQuery,
  WebSearchRecency,
  WebSearchResultItem,
} from '../web-search.types';
import {
  asRecord,
  asString,
  cleanHtmlText,
  providerFetch,
  readProviderJson,
} from './provider-http';

const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

const FRESHNESS_PARAM: Record<WebSearchRecency, string> = {
  day: 'pd',
  week: 'pw',
  month: 'pm',
  year: 'py',
};

/** Brave Web Search API：GET /res/v1/web/search，`X-Subscription-Token` 鉴权 */
export class BraveSearchProvider implements WebSearchProvider {
  readonly id = 'brave' as const;

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(
    query: WebSearchQuery,
    signal: AbortSignal,
  ): Promise<WebSearchProviderResponse> {
    const params = new URLSearchParams({
      q: query.query,
      count: String(query.limit),
    });
    if (query.recency) {
      params.set('freshness', FRESHNESS_PARAM[query.recency]);
    }
    const response = await providerFetch(
      this.id,
      `${BRAVE_SEARCH_ENDPOINT}?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': this.apiKey ?? '',
        },
      },
      signal,
    );
    const payload = asRecord(await readProviderJson(this.id, response));
    const web = asRecord(payload?.web);
    const items = Array.isArray(web?.results) ? web.results : [];
    const results: WebSearchResultItem[] = [];
    for (const item of items) {
      const record = asRecord(item);
      const url = asString(record?.url);
      if (!record || !url) {
        continue;
      }
      results.push({
        // Brave 在标题与摘要中用 <strong> 标出命中词
        title: cleanHtmlText(asString(record.title) ?? url),
        url,
        snippet: cleanHtmlText(asString(record.description) ?? ''),
        publishedAt: asString(record.page_age) ?? asString(record.age),
      });
    }
    return { results };
  }
}
