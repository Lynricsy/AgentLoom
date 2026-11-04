import type {
  WebSearchProvider,
  WebSearchProviderResponse,
  WebSearchQuery,
  WebSearchResultItem,
} from '../web-search.types';
import {
  asRecord,
  asString,
  providerFetch,
  readProviderJson,
} from './provider-http';

const TAVILY_SEARCH_ENDPOINT = 'https://api.tavily.com/search';

/** Tavily Search API：POST /search，Bearer 鉴权，`include_answer` 返回模型摘要 */
export class TavilySearchProvider implements WebSearchProvider {
  readonly id = 'tavily' as const;

  constructor(private readonly apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(
    query: WebSearchQuery,
    signal: AbortSignal,
  ): Promise<WebSearchProviderResponse> {
    const body: Record<string, unknown> = {
      query: query.query,
      max_results: query.limit,
      search_depth: 'basic',
      include_answer: true,
    };
    if (query.recency) {
      body.time_range = query.recency;
    }
    const response = await providerFetch(
      this.id,
      TAVILY_SEARCH_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      signal,
    );
    const payload = asRecord(await readProviderJson(this.id, response));
    const items = Array.isArray(payload?.results) ? payload.results : [];
    const results: WebSearchResultItem[] = [];
    for (const item of items) {
      const record = asRecord(item);
      const url = asString(record?.url);
      if (!record || !url) {
        continue;
      }
      results.push({
        title: asString(record.title) ?? url,
        url,
        snippet: (asString(record.content) ?? '').replace(/\s+/g, ' ').trim(),
        publishedAt: asString(record.published_date),
      });
    }
    return { answer: asString(payload?.answer), results };
  }
}
