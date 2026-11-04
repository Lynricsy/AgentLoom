import type { ToolSet } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import type { IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import {
  BuiltinToolsProvider,
  WEB_SEARCH_TOOL_NAME,
} from '../builtin-tools.provider';
import { WebSearchUnavailableException } from '../web-search/web-search.exceptions';
import type { WebSearchService } from '../web-search/web-search.service';
import type { WebSearchOutcome } from '../web-search/web-search.types';

const BASE_PARAMS = {
  sessionId: 'session-1',
  tenantId: 'tenant-1',
  delivery: 'storage' as const,
};

const TOOL_OPTIONS = {
  toolCallId: 'call-1',
  messages: [],
} as unknown as Parameters<NonNullable<ToolSet[string]['execute']>>[1];

function createProvider(search: WebSearchService['search']) {
  const webSearchService = { search: vi.fn(search) };
  return {
    provider: new BuiltinToolsProvider(
      webSearchService as unknown as WebSearchService,
    ),
    webSearchService,
  };
}

async function executeTool(
  tools: ToolSet,
  name: string,
  input: unknown,
): Promise<unknown> {
  const execute = tools[name]?.execute;
  if (!execute) {
    throw new Error(`tool ${name} has no execute`);
  }
  return execute(input, TOOL_OPTIONS);
}

describe('BuiltinToolsProvider', () => {
  it('缺省策略下 ToolSet 含 web_search，webSearchEnabled=false 时不含', async () => {
    const { provider } = createProvider(vi.fn());

    const defaults = await provider.buildToolSet(BASE_PARAMS);
    const disabled = await provider.buildToolSet({
      ...BASE_PARAMS,
      policy: { webSearchEnabled: false, imageGenerationEnabled: true },
    });

    expect(Object.keys(defaults)).toContain(WEB_SEARCH_TOOL_NAME);
    expect(Object.keys(disabled)).not.toContain(WEB_SEARCH_TOOL_NAME);
  });

  it('register 把 ToolSet 注册为会话工具 provider', async () => {
    const { provider } = createProvider(vi.fn());
    const registerSessionToolProvider = vi.fn();
    const runtime = { registerSessionToolProvider } as unknown as IAgentRuntime;

    await provider.register({ ...BASE_PARAMS, runtime });

    expect(registerSessionToolProvider).toHaveBeenCalledWith(
      'session-1',
      expect.any(Function),
    );
    const sessionProvider = registerSessionToolProvider.mock.calls[0]?.[1] as
      (() => Promise<ToolSet> | ToolSet) | undefined;
    const tools = await sessionProvider?.();
    expect(Object.keys(tools ?? {})).toEqual([WEB_SEARCH_TOOL_NAME]);
  });

  it('runtime 不支持会话工具或 ToolSet 为空时不注册', async () => {
    const { provider } = createProvider(vi.fn());
    const registerSessionToolProvider = vi.fn();

    await expect(
      provider.register({
        ...BASE_PARAMS,
        runtime: {} as IAgentRuntime,
      }),
    ).resolves.toBeUndefined();
    await provider.register({
      ...BASE_PARAMS,
      policy: { webSearchEnabled: false, imageGenerationEnabled: false },
      runtime: { registerSessionToolProvider } as unknown as IAgentRuntime,
    });

    expect(registerSessionToolProvider).not.toHaveBeenCalled();
  });

  it('web_search 返回带来源列表的文本', async () => {
    const outcome: WebSearchOutcome = {
      provider: 'tavily',
      answer: 'Firecracker is a VMM.',
      failures: [{ id: 'duckduckgo', reason: 'blocked or empty' }],
      results: [
        {
          title: 'Firecracker',
          url: 'https://firecracker-microvm.github.io/',
          snippet: 'Secure and fast microVMs.',
        },
      ],
    };
    const { provider, webSearchService } = createProvider(() =>
      Promise.resolve(outcome),
    );
    const tools = await provider.buildToolSet(BASE_PARAMS);

    const text = await executeTool(tools, WEB_SEARCH_TOOL_NAME, {
      query: '  firecracker  ',
      recency: 'week',
      limit: 50,
    });

    expect(webSearchService.search).toHaveBeenCalledWith({
      query: 'firecracker',
      recency: 'week',
      limit: 20,
      signal: undefined,
    });
    expect(text).toBe(
      [
        'Provider: tavily',
        'Note: answered by tavily after duckduckgo failed (duckduckgo: blocked or empty)',
        '',
        '## Answer',
        'Firecracker is a VMM.',
        '',
        '## Sources (1)',
        '[1] Firecracker',
        '    https://firecracker-microvm.github.io/',
        '    Secure and fast microVMs.',
      ].join('\n'),
    );
  });

  it('全部后端失败时 web_search 返回失败文本而不抛错', async () => {
    const { provider } = createProvider(() =>
      Promise.reject(
        new WebSearchUnavailableException([
          { id: 'duckduckgo', reason: 'blocked or empty' },
          { id: 'tavily', reason: '401' },
        ]),
      ),
    );
    const tools = await provider.buildToolSet(BASE_PARAMS);

    const text = await executeTool(tools, WEB_SEARCH_TOOL_NAME, {
      query: 'firecracker',
    });

    expect(text).toBe(
      'web search failed: duckduckgo: blocked or empty; tavily: 401',
    );
  });
});
