import type { ToolSet } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import type { StorageService } from '../../../infrastructure/storage/storage.service';
import type { IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import {
  BuiltinToolsProvider,
  GENERATE_IMAGE_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from '../builtin-tools.provider';
import { ImageGenerationFailedException } from '../image-generation/image-generation.exceptions';
import type { ImageGenerationService } from '../image-generation/image-generation.service';
import type { ResolvedImageModel } from '../image-generation/image-generation.types';
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

const IMAGE_MODEL: ResolvedImageModel = {
  configId: 'config-1',
  modelId: 'gpt-image-1',
  protocol: 'openai_responses',
  baseUrl: 'https://api.openai.com',
  providerSlug: 'openai',
  apiKeyId: 'key-1',
  organizationId: 'org-1',
};

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createProvider(
  search: WebSearchService['search'] = vi.fn(),
  image: {
    model?: ResolvedImageModel | null;
    generate?: ImageGenerationService['generate'];
  } = {},
) {
  const webSearchService = { search: vi.fn(search) };
  const imageGenerationService = {
    resolveTenantImageModel: vi.fn().mockResolvedValue(image.model ?? null),
    generate: vi.fn(
      image.generate ??
        (() =>
          Promise.resolve([
            { mediaType: 'image/png' as const, data: PNG_BYTES },
          ])),
    ),
  };
  const storageService = {
    upload: vi.fn().mockResolvedValue(undefined),
    getPresignedUrl: vi
      .fn()
      .mockResolvedValue('https://minio.example/presigned?sig=1'),
  };
  return {
    provider: new BuiltinToolsProvider(
      webSearchService as unknown as WebSearchService,
      imageGenerationService as unknown as ImageGenerationService,
      storageService as unknown as StorageService,
    ),
    webSearchService,
    imageGenerationService,
    storageService,
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

  it('无默认 image 模型或 imageGenerationEnabled=false 时 ToolSet 不含 generate_image', async () => {
    const noModel = createProvider();
    const withModel = createProvider(vi.fn(), { model: IMAGE_MODEL });

    const withoutDefault = await noModel.provider.buildToolSet(BASE_PARAMS);
    const disabled = await withModel.provider.buildToolSet({
      ...BASE_PARAMS,
      policy: { webSearchEnabled: true, imageGenerationEnabled: false },
    });
    const enabled = await withModel.provider.buildToolSet(BASE_PARAMS);

    expect(Object.keys(withoutDefault)).not.toContain(GENERATE_IMAGE_TOOL_NAME);
    expect(Object.keys(disabled)).not.toContain(GENERATE_IMAGE_TOOL_NAME);
    expect(
      withModel.imageGenerationService.resolveTenantImageModel,
    ).toHaveBeenCalledTimes(1);
    expect(Object.keys(enabled)).toEqual([
      WEB_SEARCH_TOOL_NAME,
      GENERATE_IMAGE_TOOL_NAME,
    ]);
  });

  it('解析默认 image 模型出错时只跳过 generate_image', async () => {
    const { provider, imageGenerationService } = createProvider();
    imageGenerationService.resolveTenantImageModel.mockRejectedValueOnce(
      new Error('db down'),
    );

    const tools = await provider.buildToolSet(BASE_PARAMS);

    expect(Object.keys(tools)).toEqual([WEB_SEARCH_TOOL_NAME]);
  });

  it('inline 交付：结果含 __agentloomImages 的 base64，不写对象存储', async () => {
    const { provider, imageGenerationService, storageService } = createProvider(
      vi.fn(),
      { model: IMAGE_MODEL },
    );
    const tools = await provider.buildToolSet({
      ...BASE_PARAMS,
      delivery: 'inline',
    });

    const result = (await executeTool(tools, GENERATE_IMAGE_TOOL_NAME, {
      prompt: '白发蓝眼的狐娘',
      size: '1024x1536',
      file_name: 'fox.png',
    })) as {
      model: string;
      __agentloomImages: Array<{
        fileName: string;
        mediaType: string;
        base64: string;
      }>;
    };

    expect(imageGenerationService.generate).toHaveBeenCalledWith(
      'tenant-1',
      IMAGE_MODEL,
      { prompt: '白发蓝眼的狐娘', size: '1024x1536' },
      undefined,
    );
    expect(result.model).toBe('gpt-image-1');
    expect(result.__agentloomImages).toEqual([
      {
        fileName: 'fox.png',
        mediaType: 'image/png',
        base64: PNG_BYTES.toString('base64'),
      },
    ]);
    expect(storageService.upload).not.toHaveBeenCalled();
  });

  it('inline 交付多张图时文件名不重复，缺省名按 image-<ms>.<ext>', async () => {
    const { provider } = createProvider(vi.fn(), {
      model: IMAGE_MODEL,
      generate: () =>
        Promise.resolve([
          { mediaType: 'image/png' as const, data: PNG_BYTES },
          { mediaType: 'image/jpeg' as const, data: PNG_BYTES },
        ]),
    });
    const tools = await provider.buildToolSet({
      ...BASE_PARAMS,
      delivery: 'inline',
    });

    const result = (await executeTool(tools, GENERATE_IMAGE_TOOL_NAME, {
      prompt: 'two foxes',
    })) as { __agentloomImages: Array<{ fileName: string }> };

    const [first, second] = result.__agentloomImages.map(
      (image) => image.fileName,
    );
    expect(first).toMatch(/^image-\d+\.png$/);
    expect(second).toMatch(/^image-\d+-2\.jpg$/);
  });

  it('storage 交付：上传到租户前缀并返回 24 小时预签名 URL', async () => {
    const { provider, storageService } = createProvider(vi.fn(), {
      model: IMAGE_MODEL,
    });
    const tools = await provider.buildToolSet(BASE_PARAMS);

    const result = (await executeTool(tools, GENERATE_IMAGE_TOOL_NAME, {
      prompt: 'a fox',
    })) as {
      model: string;
      images: Array<Record<string, unknown>>;
    };

    expect(storageService.upload).toHaveBeenCalledWith(
      expect.stringMatching(
        /^tenants\/tenant-1\/generated-images\/session-1\/[0-9a-f-]{36}\.png$/,
      ),
      PNG_BYTES,
      PNG_BYTES.length,
      'image/png',
    );
    const storageKey = storageService.upload.mock.calls[0]?.[0] as string;
    expect(storageService.getPresignedUrl).toHaveBeenCalledWith(
      storageKey,
      86400,
    );
    expect(result).toEqual({
      model: 'gpt-image-1',
      images: [
        {
          url: 'https://minio.example/presigned?sig=1',
          storageKey,
          mediaType: 'image/png',
          bytes: PNG_BYTES.length,
        },
      ],
    });
  });

  it('生成失败或参数非法时返回 { error } 而不抛错', async () => {
    const { provider, imageGenerationService } = createProvider(vi.fn(), {
      model: IMAGE_MODEL,
      generate: () =>
        Promise.reject(new ImageGenerationFailedException('500 upstream')),
    });
    const tools = await provider.buildToolSet({
      ...BASE_PARAMS,
      delivery: 'inline',
    });

    await expect(
      executeTool(tools, GENERATE_IMAGE_TOOL_NAME, { prompt: 'a fox' }),
    ).resolves.toEqual({ error: '500 upstream' });
    await expect(
      executeTool(tools, GENERATE_IMAGE_TOOL_NAME, {
        prompt: 'a fox',
        file_name: '../etc/passwd',
      }),
    ).resolves.toEqual({
      error: 'file_name must match ^[A-Za-z0-9._-]{1,120}$',
    });
    expect(imageGenerationService.generate).toHaveBeenCalledTimes(1);
  });
});
