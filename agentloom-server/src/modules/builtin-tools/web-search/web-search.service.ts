import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../config/env.schema';
import { BraveSearchProvider } from './providers/brave.provider';
import { DuckDuckGoSearchProvider } from './providers/duckduckgo.provider';
import { ExaSearchProvider } from './providers/exa.provider';
import { TavilySearchProvider } from './providers/tavily.provider';
import { WebSearchUnavailableException } from './web-search.exceptions';
import {
  WEB_SEARCH_PROVIDER_IDS,
  WebSearchProviderError,
  type WebSearchFailure,
  type WebSearchOutcome,
  type WebSearchProvider,
  type WebSearchProviderId,
  type WebSearchRecency,
} from './web-search.types';

const SNIPPET_MAX_CHARS = 240;
const DEFAULT_PROVIDER_CHAIN = 'duckduckgo';

export interface WebSearchInput {
  query: string;
  recency?: WebSearchRecency;
  limit: number;
  signal?: AbortSignal;
}

/**
 * 按 `APP_WEB_SEARCH_PROVIDERS` 顺序依次尝试已配置的后端，首个成功即返回；
 * 失败的后端记入 failures，全部失败抛 WebSearchUnavailableException。
 */
@Injectable()
export class WebSearchService {
  private readonly chain: WebSearchProvider[];

  constructor(configService: ConfigService<EnvConfig, true>) {
    const providers: Record<WebSearchProviderId, WebSearchProvider> = {
      duckduckgo: new DuckDuckGoSearchProvider(),
      tavily: new TavilySearchProvider(
        configService.get('APP_WEB_SEARCH_TAVILY_API_KEY', { infer: true }),
      ),
      brave: new BraveSearchProvider(
        configService.get('APP_WEB_SEARCH_BRAVE_API_KEY', { infer: true }),
      ),
      exa: new ExaSearchProvider(
        configService.get('APP_WEB_SEARCH_EXA_API_KEY', { infer: true }),
      ),
    };
    this.chain = parseProviderChain(
      configService.get('APP_WEB_SEARCH_PROVIDERS', { infer: true }),
    ).map((id) => providers[id]);
  }

  async search(input: WebSearchInput): Promise<WebSearchOutcome> {
    const signal = input.signal ?? new AbortController().signal;
    const failures: WebSearchFailure[] = [];

    for (const provider of this.chain) {
      if (!provider.isConfigured()) {
        continue;
      }
      try {
        const response = await provider.search(
          { query: input.query, recency: input.recency, limit: input.limit },
          signal,
        );
        return {
          provider: provider.id,
          answer: response.answer,
          results: response.results.slice(0, input.limit).map((result) => ({
            ...result,
            snippet:
              result.snippet.length > SNIPPET_MAX_CHARS
                ? `${result.snippet.slice(0, SNIPPET_MAX_CHARS - 1)}…`
                : result.snippet,
          })),
          failures,
        };
      } catch (error) {
        // 调用方中止（会话取消）时不再回退到下一个后端
        if (signal.aborted) {
          throw error;
        }
        failures.push({
          id: provider.id,
          reason:
            error instanceof WebSearchProviderError
              ? error.reason
              : error instanceof Error
                ? error.message
                : String(error),
        });
      }
    }
    throw new WebSearchUnavailableException(failures);
  }
}

/** 去重并丢弃未知项（env schema 已校验，这里只兜底空值） */
function parseProviderChain(raw: string | undefined): WebSearchProviderId[] {
  const ids: WebSearchProviderId[] = [];
  for (const item of (raw ?? DEFAULT_PROVIDER_CHAIN).split(',')) {
    const id = item.trim() as WebSearchProviderId;
    if (WEB_SEARCH_PROVIDER_IDS.includes(id) && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}
