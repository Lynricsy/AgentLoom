import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import type { LlmService } from '../../llm/llm.service';
import {
  ImageGenerationFailedException,
  ImageGenerationUnsupportedProtocolException,
} from '../image-generation/image-generation.exceptions';
import { ImageGenerationService } from '../image-generation/image-generation.service';
import type { ResolvedImageModel } from '../image-generation/image-generation.types';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const OPENAI_MODEL: ResolvedImageModel = {
  configId: 'config-1',
  modelId: 'gpt-image-1',
  protocol: 'openai_responses',
  baseUrl: 'https://api.openai.com',
  providerSlug: 'openai',
  apiKeyId: 'key-1',
  organizationId: 'org-1',
};

const GEMINI_MODEL: ResolvedImageModel = {
  configId: 'config-2',
  modelId: 'gemini-2.5-flash-image',
  protocol: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com',
  providerSlug: 'google',
  apiKeyId: null,
  organizationId: 'org-1',
};

function createService(
  findDefaultByType: LlmService['findDefaultByType'] = vi.fn(),
) {
  const tx = { execute: vi.fn().mockResolvedValue(undefined) };
  const db = {
    transaction: vi.fn((operation: (client: unknown) => Promise<unknown>) =>
      operation(tx),
    ),
  };
  const llmService = { findDefaultByType: vi.fn(findDefaultByType) };
  const decryptionBoundaryService = {
    decryptConfiguredApiKey: vi.fn().mockResolvedValue('sk-test'),
  };
  return {
    service: new ImageGenerationService(
      db as unknown as DrizzleDB,
      llmService as unknown as LlmService,
      decryptionBoundaryService as unknown as DecryptionBoundaryService,
    ),
    llmService,
    decryptionBoundaryService,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ImageGenerationService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolveTenantImageModel 返回租户默认 image 模型，禁用时返回 null', async () => {
    const resolved = {
      id: 'config-1',
      modelId: 'gpt-image-1',
      isEnabled: true,
      provider: {
        slug: 'openai',
        apiProtocol: 'openai_responses',
        baseUrl: null,
        defaultBaseUrl: 'https://api.openai.com/',
        apiKeyId: 'key-1',
        orgId: 'org-1',
        isEnabled: true,
      },
    };
    const { service, llmService } = createService(
      vi
        .fn()
        .mockResolvedValueOnce(resolved)
        .mockResolvedValueOnce({ ...resolved, isEnabled: false })
        .mockResolvedValueOnce(null),
    );

    await expect(service.resolveTenantImageModel('tenant-1')).resolves.toEqual(
      OPENAI_MODEL,
    );
    expect(llmService.findDefaultByType).toHaveBeenCalledWith(
      'tenant-1',
      'image',
    );
    await expect(
      service.resolveTenantImageModel('tenant-1'),
    ).resolves.toBeNull();
    await expect(
      service.resolveTenantImageModel('tenant-1'),
    ).resolves.toBeNull();
  });

  it('OpenAI gpt-image：POST /v1/images/generations，不带 response_format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        output_format: 'png',
        data: [{ b64_json: PNG_BYTES.toString('base64') }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { service, decryptionBoundaryService } = createService();

    const images = await service.generate('tenant-1', OPENAI_MODEL, {
      prompt: 'a fox',
      size: '1536x1024',
    });

    expect(images).toEqual([{ mediaType: 'image/png', data: PNG_BYTES }]);
    expect(
      decryptionBoundaryService.decryptConfiguredApiKey,
    ).toHaveBeenCalledWith(
      {
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        tenantId: 'tenant-1',
        provider: 'openai',
      },
      'ImageGenerationService.generate',
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'gpt-image-1',
      prompt: 'a fox',
      n: 1,
      size: '1536x1024',
    });
  });

  it('OpenAI dall-e：带 response_format=b64_json；baseUrl 已含 /v1 时不重复', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [{ b64_json: JPEG_BYTES.toString('base64') }] }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { service } = createService();

    const images = await service.generate(
      'tenant-1',
      {
        ...OPENAI_MODEL,
        modelId: 'dall-e-3',
        protocol: 'openai_chat',
        baseUrl: 'https://gateway.example/v1',
      },
      { prompt: 'a fox', size: '1024x1024' },
    );

    expect(images[0]?.mediaType).toBe('image/jpeg');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/v1/images/generations');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'dall-e-3',
      response_format: 'b64_json',
    });
  });

  it('OpenAI 只返回 url 时下载图片字节', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ url: 'https://cdn.example/fox.png' }] }),
      )
      .mockResolvedValueOnce(new Response(PNG_BYTES));
    vi.stubGlobal('fetch', fetchMock);
    const { service } = createService();

    const images = await service.generate('tenant-1', OPENAI_MODEL, {
      prompt: 'a fox',
      size: '1024x1024',
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://cdn.example/fox.png');
    expect(images).toEqual([{ mediaType: 'image/png', data: PNG_BYTES }]);
  });

  it('Gemini：POST /v1beta/models/<model>:generateContent 并解析 inlineData', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                { text: 'Here is your fox.' },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: PNG_BYTES.toString('base64'),
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { service } = createService();

    const images = await service.generate('tenant-1', GEMINI_MODEL, {
      prompt: 'a fox',
      size: '1024x1536',
    });

    expect(images).toEqual([{ mediaType: 'image/png', data: PNG_BYTES }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    );
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'sk-test' });
    expect(JSON.parse(String(init.body))).toEqual({
      contents: [{ parts: [{ text: 'a fox\n\nAspect ratio: 9:16' }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    });
  });

  it('Gemini baseUrl 已带 /v1 时原样使用；无图片时抛失败', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'cannot draw' }] } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { service } = createService();

    await expect(
      service.generate(
        'tenant-1',
        { ...GEMINI_MODEL, baseUrl: 'https://gemini-proxy.example/v1' },
        { prompt: 'a fox', size: '1024x1024' },
      ),
    ).rejects.toThrow(ImageGenerationFailedException);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://gemini-proxy.example/v1/models/gemini-2.5-flash-image:generateContent',
    );
  });

  it('非 2xx 抛 ImageGenerationFailedException，detail 含状态码与响应体', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"error":{"message":"billing hard limit"}}', {
          status: 400,
        }),
      ),
    );
    const { service } = createService();

    const error = await service
      .generate('tenant-1', OPENAI_MODEL, {
        prompt: 'a fox',
        size: '1024x1024',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ImageGenerationFailedException);
    expect((error as ImageGenerationFailedException).detail).toBe(
      '400 {"error":{"message":"billing hard limit"}}',
    );
    expect((error as ImageGenerationFailedException).getStatus()).toBe(502);
  });

  it('anthropic 等协议抛 unsupported，且不解密密钥、不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { service, decryptionBoundaryService } = createService();

    await expect(
      service.generate(
        'tenant-1',
        { ...OPENAI_MODEL, protocol: 'anthropic' },
        { prompt: 'a fox', size: '1024x1024' },
      ),
    ).rejects.toThrow(ImageGenerationUnsupportedProtocolException);
    expect(
      decryptionBoundaryService.decryptConfiguredApiKey,
    ).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
