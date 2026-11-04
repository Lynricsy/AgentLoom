/** web_search 可用的搜索后端；`APP_WEB_SEARCH_PROVIDERS` 的取值范围 */
export const WEB_SEARCH_PROVIDER_IDS = [
  'duckduckgo',
  'tavily',
  'brave',
  'exa',
] as const;

export type WebSearchProviderId = (typeof WEB_SEARCH_PROVIDER_IDS)[number];

export const WEB_SEARCH_RECENCIES = ['day', 'week', 'month', 'year'] as const;

export type WebSearchRecency = (typeof WEB_SEARCH_RECENCIES)[number];

export interface WebSearchQuery {
  query: string;
  recency?: WebSearchRecency;
  limit: number;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface WebSearchProviderResponse {
  answer?: string;
  results: WebSearchResultItem[];
}

export interface WebSearchProvider {
  readonly id: WebSearchProviderId;
  /** 未配置 key 的后端不进入回退链 */
  isConfigured(): boolean;
  search(
    query: WebSearchQuery,
    signal: AbortSignal,
  ): Promise<WebSearchProviderResponse>;
}

export interface WebSearchFailure {
  id: WebSearchProviderId;
  reason: string;
}

export interface WebSearchOutcome {
  provider: WebSearchProviderId;
  answer?: string;
  results: WebSearchResultItem[];
  /** 在成功后端之前失败的后端及原因 */
  failures: WebSearchFailure[];
}

/** 单个后端失败；由 WebSearchService 收集后继续尝试链上的下一个后端 */
export class WebSearchProviderError extends Error {
  constructor(
    readonly providerId: WebSearchProviderId,
    readonly reason: string,
  ) {
    super(`${providerId}: ${reason}`);
    this.name = 'WebSearchProviderError';
  }
}
