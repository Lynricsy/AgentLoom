import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecryptionBoundaryService } from '../../api-key/decryption-boundary.service';
import type { FetchPrivateCloudModelsDto } from '../dto/private-cloud-models.dto';
import type { TestConnectionDto } from '../dto/test-connection.dto';
import {
  LlmProviderException,
  LlmTimeoutException,
} from '../llm.exceptions';
import {
  PrivateCloudService,
  type PrivateCloudRequestContext,
  type PrivateCloudServerInfo,
} from '../private-cloud.service';

type PrivateCloudServiceInternals = {
  extractServerInfo: (res: Response) => Promise<PrivateCloudServerInfo | undefined>;
};

const REQUEST_CONTEXT: PrivateCloudRequestContext = {
  tenantId: 'tenant-id',
  orgId: 'org-id',
};

function createTestConnectionDto(
  overrides: Partial<TestConnectionDto> = {},
): TestConnectionDto {
  return {
    endpointUrl: 'https://private-cloud.example.com/',
    authMethod: 'api_key',
    apiKeyId: '00000000-0000-0000-0000-000000000001',
    timeoutMs: 10_000,
    ...overrides,
  } as TestConnectionDto;
}

function createFetchModelsDto(
  overrides: Partial<FetchPrivateCloudModelsDto> = {},
): FetchPrivateCloudModelsDto {
  return {
    endpointUrl: 'https://private-cloud.example.com/',
    authMethod: 'api_key',
    apiKeyId: '00000000-0000-0000-0000-000000000001',
    ...overrides,
  } as FetchPrivateCloudModelsDto;
}

describe('PrivateCloudService', () => {
  let service: PrivateCloudService;
  let savedFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let decryptionBoundaryService: {
    decryptConfiguredApiKey: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    savedFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    decryptionBoundaryService = {
      decryptConfiguredApiKey: vi.fn().mockResolvedValue('decrypted-key'),
    };
    service = new PrivateCloudService(
      decryptionBoundaryService as unknown as DecryptionBoundaryService,
    );
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
    vi.restoreAllMocks();
  });

  describe('testConnection', () => {
    it('应当在 /health 成功时返回连接结果和服务器信息', async () => {
      vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_025);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ version: 'v1.2.3', status: 'healthy' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.testConnection(
        createTestConnectionDto({
          endpointUrl: 'https://private-cloud.example.com///',
        }),
        REQUEST_CONTEXT,
      );

      expect(result).toEqual({
        success: true,
        latencyMs: 25,
        serverInfo: {
          version: 'v1.2.3',
          status: 'healthy',
        },
      });
      expect(
        decryptionBoundaryService.decryptConfiguredApiKey,
      ).toHaveBeenCalledWith(
        {
          apiKeyId: '00000000-0000-0000-0000-000000000001',
          organizationId: 'org-id',
          tenantId: 'tenant-id',
          provider: 'private_cloud',
        },
        'PrivateCloudService',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://private-cloud.example.com/health',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer decrypted-key',
          },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('应当在 /health 返回非 ok 时回退到 /v1/models', async () => {
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      vi.spyOn(Date, 'now').mockReturnValueOnce(2_000).mockReturnValueOnce(2_018);

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({}),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 'llama-3' }] }),
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const result = await service.testConnection(
        createTestConnectionDto({ authMethod: 'none', apiKeyId: undefined }),
        REQUEST_CONTEXT,
      );

      expect(result).toEqual({
        success: true,
        latencyMs: 18,
        serverInfo: { models: ['llama-3'] },
      });
      expect(
        decryptionBoundaryService.decryptConfiguredApiKey,
      ).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://private-cloud.example.com/health',
        expect.objectContaining({
          headers: {},
          signal: expect.any(AbortSignal),
        }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://private-cloud.example.com/v1/models',
        expect.objectContaining({
          headers: {},
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('应当在 /health 抛错时记录日志并回退到 /v1/models', async () => {
      const debugSpy = vi
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined);

      mockFetch
        .mockRejectedValueOnce(new Error('health unavailable'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const result = await service.testConnection(
        createTestConnectionDto(),
        REQUEST_CONTEXT,
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenCalledWith('/health 端点不可用，尝试 /v1/models');
    });

    it.each([401, 403])(
      '应当在 /v1/models 返回 %i 时抛出结构化认证错误',
      async (status) => {
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 503,
            json: async () => ({}),
            headers: new Headers(),
          })
          .mockResolvedValueOnce({
            ok: false,
            status,
            json: async () => ({}),
            headers: new Headers(),
          });

        const promise = service.testConnection(
          createTestConnectionDto(),
          REQUEST_CONTEXT,
        );

        await expect(promise).rejects.toBeInstanceOf(LlmProviderException);
        await expect(promise).rejects.toMatchObject({
          detail: `认证失败 (${status})，请检查认证配置`,
          extensions: { authenticationFailed: true },
        });
      },
    );

    it('应当在超时时抛出 LlmTimeoutException 并使用自定义超时', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');

      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockRejectedValueOnce(abortError);

      const promise = service.testConnection(
        createTestConnectionDto({ timeoutMs: 15_000 }),
        REQUEST_CONTEXT,
      );

      await expect(promise).rejects.toBeInstanceOf(LlmTimeoutException);
      await expect(promise).rejects.toMatchObject({
        detail: '连接超时 (15000ms)',
      });
    });

    it('应当在网络错误时包装为提供商异常', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('health unavailable'))
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      const promise = service.testConnection(
        createTestConnectionDto(),
        REQUEST_CONTEXT,
      );

      await expect(promise).rejects.toBeInstanceOf(LlmProviderException);
      await expect(promise).rejects.toMatchObject({
        detail: '无法连接到私有云端点: connect ECONNREFUSED',
      });
    });

    it('应当在 /v1/models 返回非 ok 状态时抛出提供商异常', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({}),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({}),
          headers: new Headers(),
        });

      const promise = service.testConnection(
        createTestConnectionDto(),
        REQUEST_CONTEXT,
      );

      await expect(promise).rejects.toBeInstanceOf(LlmProviderException);
      await expect(promise).rejects.toMatchObject({
        detail: '端点返回状态码 500',
      });
    });
  });

  describe('fetchModels', () => {
    it('应当返回模型列表', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'model-a', owned_by: 'team-a' },
            { id: 'model-b' },
          ],
        }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.fetchModels(
        createFetchModelsDto({ endpointUrl: 'https://private-cloud.example.com///' }),
        REQUEST_CONTEXT,
      );

      expect(result).toEqual([
        { id: 'model-a', name: 'model-a', ownedBy: 'team-a' },
        { id: 'model-b', name: 'model-b', ownedBy: 'unknown' },
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://private-cloud.example.com/v1/models',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer decrypted-key',
          },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('应当在模型数组为空时返回空数组', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.fetchModels(
        createFetchModelsDto({ authMethod: 'none', apiKeyId: undefined }),
        REQUEST_CONTEXT,
      );

      expect(result).toEqual([]);
      expect(
        decryptionBoundaryService.decryptConfiguredApiKey,
      ).not.toHaveBeenCalled();
    });

    it('应当在响应缺少 data 时返回空数组', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = await service.fetchModels(
        createFetchModelsDto({ authMethod: 'mtls', apiKeyId: undefined }),
        REQUEST_CONTEXT,
      );

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://private-cloud.example.com/v1/models',
        expect.objectContaining({
          headers: {},
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it.each([401, 403])(
      '应当在获取模型时将 %i 视为结构化认证错误',
      async (status) => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status,
          json: async () => ({}),
          headers: new Headers(),
        });

        const promise = service.fetchModels(
          createFetchModelsDto(),
          REQUEST_CONTEXT,
        );

        await expect(promise).rejects.toBeInstanceOf(LlmProviderException);
        await expect(promise).rejects.toMatchObject({
          detail: `认证失败 (${status})，请检查认证配置`,
          extensions: { authenticationFailed: true },
        });
      },
    );

    it('应当在超时时抛出 LlmTimeoutException', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      const promise = service.fetchModels(
        createFetchModelsDto(),
        REQUEST_CONTEXT,
      );

      await expect(promise).rejects.toBeInstanceOf(LlmTimeoutException);
      await expect(promise).rejects.toMatchObject({
        detail: '连接超时 (10000ms)',
      });
    });

    it('应当在端点返回非 ok 状态时抛出提供商异常', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
        headers: new Headers(),
      });

      const promise = service.fetchModels(
        createFetchModelsDto(),
        REQUEST_CONTEXT,
      );

      await expect(promise).rejects.toBeInstanceOf(LlmProviderException);
      await expect(promise).rejects.toMatchObject({
        detail: '获取模型列表失败，状态码 500',
      });
    });

    it('应当在网络错误时包装为提供商异常', async () => {
      mockFetch.mockRejectedValueOnce(new Error('socket hang up'));

      const promise = service.fetchModels(
        createFetchModelsDto(),
        REQUEST_CONTEXT,
      );

      await expect(promise).rejects.toBeInstanceOf(LlmProviderException);
      await expect(promise).rejects.toMatchObject({
        detail: '无法获取模型列表: socket hang up',
      });
    });
  });

  describe('extractServerInfo', () => {
    it('应当在响应包含 version 和 status 时返回结构化信息', async () => {
      const internals = service as unknown as PrivateCloudServiceInternals;

      const result = await internals.extractServerInfo({
        json: async () => ({ version: 'v1.2.3', status: 'healthy' }),
      } as Response);

      expect(result).toEqual({ version: 'v1.2.3', status: 'healthy' });
    });

    it('应当在响应包含模型列表时返回 models 字段', async () => {
      const internals = service as unknown as PrivateCloudServiceInternals;

      const result = await internals.extractServerInfo({
        json: async () => ({
          data: [{ id: 'llama-3' }, { id: 'deepseek-r1' }, { id: 123 }],
        }),
      } as Response);

      expect(result).toEqual({ models: ['llama-3', 'deepseek-r1'] });
    });

    it('应当在响应缺少可识别字段时返回 undefined', async () => {
      const internals = service as unknown as PrivateCloudServiceInternals;

      const result = await internals.extractServerInfo({
        json: async () => ({ message: 'ok' }),
      } as Response);

      expect(result).toBeUndefined();
    });

    it('应当在解析响应失败时返回 undefined', async () => {
      const internals = service as unknown as PrivateCloudServiceInternals;

      const result = await internals.extractServerInfo({
        json: async () => {
          throw new Error('invalid json');
        },
      } as unknown as Response);

      expect(result).toBeUndefined();
    });
  });
});
