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
  recencyStartIso,
} from './provider-http';

const EXA_SEARCH_ENDPOINT = 'https://api.exa.ai/search';

/** Exa Search API：POST /search，`x-api-key` 鉴权，摘要取 `contents.text` 的前 500 字 */
export class ExaSearchProvider implements WebSearchProvider {
  readonly id = 'exa' as const;

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
      numResults: query.limit,
      type: 'auto',
      contents: { text: { maxCharacters: 500 } },
    };
    if (query.recency) {
      body.startPublishedDate = recencyStartIso(query.recency);
    }
    const response = await providerFetch(
      this.id,
      EXA_SEARCH_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey ?? '',
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
        snippet: (asString(record.text) ?? '').replace(/\s+/g, ' ').trim(),
        publishedAt: asString(record.publishedDate),
      });
    }
    return { results };
  }
}
