import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../config/env.schema';
import { parseDuckDuckGoHtml } from '../web-search/providers/duckduckgo.provider';
import { WebSearchUnavailableException } from '../web-search/web-search.exceptions';
import { WebSearchService } from '../web-search/web-search.service';

const DDG_FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'duckduckgo-results.html'),
  'utf8',
);
const DDG_ANOMALY_PAGE =
  '<html><body><div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div></body></html>';

function createService(env: Record<string, unknown>): WebSearchService {
  return new WebSearchService({
    get: (key: string) => env[key],
  } as unknown as ConfigService<EnvConfig, true>);
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: unknown): string {
  return input instanceof Request ? input.url : String(input);
}

describe('WebSearchService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('解析 DuckDuckGo HTML：跳过广告，uddg 链接解码为真实 URL', () => {
    const results = parseDuckDuckGoHtml(DDG_FIXTURE);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Firecracker – microVMs for serverless',
      url: 'https://firecracker-microvm.github.io/?ref=ddg&lang=en',
      snippet:
        'Firecracker is an open source virtualization technology that is purpose-built for creating & managing secure, multi-tenant container and function-based services.',
    });
    expect(results[1]).toEqual({
      title: 'GitHub – firecracker-microvm/firecracker',
      url: 'https://github.com/firecracker-microvm/firecracker',
      snippet: 'Secure and fast microVMs for serverless computing.',
    });
  });

  it('DuckDuckGo 请求为表单 POST，recency 映射为 df', async () => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(DDG_FIXTURE));
    vi.stubGlobal('fetch', fetchMock);
    const service = createService({ APP_WEB_SEARCH_PROVIDERS: 'duckduckgo' });

    const outcome = await service.search({
      query: 'firecracker microvm',
      recency: 'week',
      limit: 1,
    });

    expect(outcome.provider).toBe('duckduckgo');
    expect(outcome.results).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://html.duckduckgo.com/html/');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('q=firecracker+microvm&df=w');
  });

  it('链上未配置 key 的后端被跳过：tavily 无 key 时只调用 DuckDuckGo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(DDG_FIXTURE));
    vi.stubGlobal('fetch', fetchMock);
    const service = createService({
      APP_WEB_SEARCH_PROVIDERS: 'tavily,duckduckgo',
    });

    const outcome = await service.search({ query: 'firecracker', limit: 8 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestUrl(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://html.duckduckgo.com/html/',
    );
    expect(outcome.provider).toBe('duckduckgo');
    expect(outcome.failures).toEqual([]);
    expect(outcome.results).toHaveLength(2);
  });

  it('DuckDuckGo 返回拦截页时回退到 Tavily 并记录失败', async () => {
    const fetchMock = vi.fn((input: unknown) => {
      const url = requestUrl(input);
      if (url.startsWith('https://html.duckduckgo.com/')) {
        return Promise.resolve(htmlResponse(DDG_ANOMALY_PAGE));
      }
      return Promise.resolve(
        jsonResponse({
          answer: 'Firecracker is a VMM by AWS.',
          results: [
            {
              title: 'Firecracker',
              url: 'https://firecracker-microvm.github.io/',
              content: 'Secure and fast microVMs.',
              published_date: '2026-10-01',
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = createService({
      APP_WEB_SEARCH_PROVIDERS: 'duckduckgo,tavily',
      APP_WEB_SEARCH_TAVILY_API_KEY: 'tvly-key',
    });

    const outcome = await service.search({
      query: 'firecracker',
      recency: 'month',
      limit: 5,
    });

    expect(outcome.provider).toBe('tavily');
    expect(outcome.failures[0]).toEqual({
      id: 'duckduckgo',
      reason: 'blocked or empty',
    });
    expect(outcome.answer).toBe('Firecracker is a VMM by AWS.');
    expect(outcome.results[0]).toMatchObject({
      url: 'https://firecracker-microvm.github.io/',
      snippet: 'Secure and fast microVMs.',
      publishedAt: '2026-10-01',
    });
    const tavilyCall = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(tavilyCall[0]).toBe('https://api.tavily.com/search');
    expect(tavilyCall[1].headers).toMatchObject({
      Authorization: 'Bearer tvly-key',
    });
    expect(JSON.parse(String(tavilyCall[1].body))).toEqual({
      query: 'firecracker',
      max_results: 5,
      search_depth: 'basic',
      include_answer: true,
      time_range: 'month',
    });
  });

  it('全部后端失败时抛 WebSearchUnavailableException 并带上失败链', async () => {
    const fetchMock = vi.fn((input: unknown) => {
      const url = requestUrl(input);
      if (url.startsWith('https://html.duckduckgo.com/')) {
        return Promise.resolve(htmlResponse(DDG_ANOMALY_PAGE));
      }
      return Promise.resolve(jsonResponse({ error: 'quota' }, 429));
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = createService({
      APP_WEB_SEARCH_PROVIDERS: 'duckduckgo,brave',
      APP_WEB_SEARCH_BRAVE_API_KEY: 'brave-key',
    });

    const error = await service
      .search({ query: 'firecracker', limit: 8 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WebSearchUnavailableException);
    expect((error as WebSearchUnavailableException).failures).toEqual([
      { id: 'duckduckgo', reason: 'blocked or empty' },
      { id: 'brave', reason: '429' },
    ]);
    expect((error as WebSearchUnavailableException).getStatus()).toBe(502);
  });

  it('Brave 与 Exa 按官方接口形状请求并解析结果', async () => {
    const fetchMock = vi.fn((input: unknown) => {
      const url = requestUrl(input);
      if (url.startsWith('https://api.search.brave.com/')) {
        return Promise.resolve(jsonResponse({ error: 'unavailable' }, 503));
      }
      return Promise.resolve(
        jsonResponse({
          results: [
            {
              title: 'Exa result',
              url: 'https://exa.example/doc',
              text: 'Some\n  extracted   text',
              publishedDate: '2026-09-01T00:00:00.000Z',
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = createService({
      APP_WEB_SEARCH_PROVIDERS: 'brave,exa',
      APP_WEB_SEARCH_BRAVE_API_KEY: 'brave-key',
      APP_WEB_SEARCH_EXA_API_KEY: 'exa-key',
    });

    const outcome = await service.search({
      query: 'micro vm',
      recency: 'day',
      limit: 3,
    });

    const [braveUrl, braveInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(braveUrl).toBe(
      'https://api.search.brave.com/res/v1/web/search?q=micro+vm&count=3&freshness=pd',
    );
    expect(braveInit.headers).toMatchObject({
      'X-Subscription-Token': 'brave-key',
    });
    const [exaUrl, exaInit] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(exaUrl).toBe('https://api.exa.ai/search');
    expect(exaInit.headers).toMatchObject({ 'x-api-key': 'exa-key' });
    expect(JSON.parse(String(exaInit.body))).toMatchObject({
      query: 'micro vm',
      numResults: 3,
      type: 'auto',
      contents: { text: { maxCharacters: 500 } },
      startPublishedDate: expect.any(String) as unknown,
    });
    expect(outcome).toMatchObject({
      provider: 'exa',
      failures: [{ id: 'brave', reason: '503' }],
      results: [
        {
          title: 'Exa result',
          url: 'https://exa.example/doc',
          snippet: 'Some extracted text',
          publishedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('摘要截断到 240 字', async () => {
    const longSnippet = 'x'.repeat(400);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { title: 't', url: 'https://a.example/', content: longSnippet },
          ],
        }),
      ),
    );
    const service = createService({
      APP_WEB_SEARCH_PROVIDERS: 'tavily',
      APP_WEB_SEARCH_TAVILY_API_KEY: 'k',
    });

    const outcome = await service.search({ query: 'q', limit: 8 });

    expect(outcome.results[0]?.snippet).toHaveLength(240);
  });
});
