import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AllExceptionsFilter } from '../../../common/filters/all-exceptions.filter';
import { LlmModelConfigNotFoundException } from '../llm.exceptions';
import { LlmController } from '../llm.controller';
import { LlmProviderController } from '../llm-provider.controller';
import type { LlmProviderService } from '../llm-provider.service';
import { LlmService } from '../llm.service';
import type { ModelDiscoveryService } from '../model-discovery.service';
import { ThinkingCapabilityService } from '../thinking-capability.service';
import { deriveLiteLLMThinkingCapability } from '../thinking-capability.util';

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const CONFIG_ID = '00000000-0000-0000-0000-000000000100';

const MOCK_CONFIG = {
  id: CONFIG_ID,
  orgId: 'org-id',
  tenantId: TENANT_ID,
  name: 'Test Config',
  provider: 'openai' as const,
  modelName: 'gpt-4o',
  parameters: {},
  apiKeyId: null,
  isDefault: false,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ---------------------------------------------------------------------------
// LlmController 测试
// ---------------------------------------------------------------------------

describe('LlmController', () => {
  let controller: LlmController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    service = {
      create: vi.fn().mockResolvedValue(MOCK_CONFIG),
      findAll: vi.fn().mockResolvedValue([MOCK_CONFIG]),
      findById: vi.fn().mockResolvedValue(MOCK_CONFIG),
      update: vi.fn().mockResolvedValue(MOCK_CONFIG),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    controller = new LlmController(
      service as unknown as LlmService,
      { resolve: vi.fn() } as unknown as ThinkingCapabilityService,
    );
  });

  // ========== 角色元数据验证 ==========

  // ========== 方法调用验证 ==========

  describe('create', () => {
    it('应当调用 service.create 并返回 { data }', async () => {
      const dto = {
        name: 'Config',
        provider: 'openai' as const,
        modelName: 'gpt-4o',
      };
      const result = await controller.create(dto as never, USER_ID, TENANT_ID);

      expect(service.create).toHaveBeenCalledWith(dto, TENANT_ID, USER_ID);
      expect(result).toEqual({ data: MOCK_CONFIG });
    });
  });

  describe('findAll', () => {
    it('应当调用 service.findAll 并返回 { data }', async () => {
      const result = await controller.findAll(TENANT_ID);

      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual({ data: [MOCK_CONFIG] });
    });
  });

  describe('findById', () => {
    it('应当调用 service.findById 并返回 { data }', async () => {
      const result = await controller.findById(CONFIG_ID, TENANT_ID);

      expect(service.findById).toHaveBeenCalledWith(CONFIG_ID, TENANT_ID);
      expect(result).toEqual({ data: MOCK_CONFIG });
    });
  });

  describe('update', () => {
    it('应当调用 service.update 并返回 { data }', async () => {
      const dto = { modelName: 'gpt-4o-mini' };
      const result = await controller.update(
        CONFIG_ID,
        dto as never,
        TENANT_ID,
      );

      expect(service.update).toHaveBeenCalledWith(CONFIG_ID, dto, TENANT_ID);
      expect(result).toEqual({ data: MOCK_CONFIG });
    });
  });

  describe('delete', () => {
    it('应当调用 service.delete', async () => {
      await controller.delete(CONFIG_ID, TENANT_ID);

      expect(service.delete).toHaveBeenCalledWith(CONFIG_ID, TENANT_ID);
    });
  });
});

describe('GET /llm-models/:id/thinking-capability', () => {
  let app: NestFastifyApplication;
  let findById: Mock;
  let resolve: Mock;

  beforeEach(async () => {
    findById = vi.fn();
    resolve = vi.fn();
    const module = await Test.createTestingModule({
      controllers: [LlmController],
      providers: [
        { provide: LlmService, useValue: { findById } },
        { provide: ThinkingCapabilityService, useValue: { resolve } },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('200：按模型配置的 provider/apiProtocol/modelId 返回能力', async () => {
    findById.mockResolvedValue({
      id: CONFIG_ID,
      modelId: 'gpt-6.1-sol',
      provider: { slug: 'private_cloud', apiProtocol: 'openai_responses' },
    });
    resolve.mockResolvedValue(
      deriveLiteLLMThinkingCapability({
        supports_reasoning: true,
        supports_none_reasoning_effort: false,
        supports_minimal_reasoning_effort: false,
        supports_xhigh_reasoning_effort: true,
        supports_max_reasoning_effort: true,
      }),
    );

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/llm-models/${CONFIG_ID}/thinking-capability`,
      });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        status: 'supported',
        levels: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultLevel: null,
        source: 'litellm',
      },
    });
    expect(resolve).toHaveBeenCalledWith({
      providerSlug: 'private_cloud',
      apiProtocol: 'openai_responses',
      modelId: 'gpt-6.1-sol',
    });
  });

  it('200：两个来源都不认识时 status 为 unknown', async () => {
    findById.mockResolvedValue({
      id: CONFIG_ID,
      modelId: 'mystery',
      provider: { slug: 'custom', apiProtocol: 'openai_chat' },
    });
    resolve.mockResolvedValue({
      capability: { status: 'unknown' },
      piModel: { reasoning: true },
    });

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/llm-models/${CONFIG_ID}/thinking-capability`,
      });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { status: 'unknown' } });
  });

  it('404：模型配置不存在', async () => {
    findById.mockRejectedValue(new LlmModelConfigNotFoundException(CONFIG_ID));

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/llm-models/${CONFIG_ID}/thinking-capability`,
      });

    expect(response.statusCode).toBe(404);
    expect(resolve).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LlmProviderController 测试
// ---------------------------------------------------------------------------

const PROVIDER_ID = '00000000-0000-0000-0000-000000000200';
const MOCK_PROVIDER = {
  id: PROVIDER_ID,
  orgId: 'org-id',
  tenantId: TENANT_ID,
  slug: 'openai',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com',
  defaultBaseUrl: 'https://api.openai.com',
  isBuiltin: true,
  isEnabled: true,
  apiProtocol: 'openai_chat' as const,
  apiKeyId: null,
  iconUrl: null,
  sortOrder: 0,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('LlmProviderController', () => {
  let controller: LlmProviderController;
  let providerService: Record<string, ReturnType<typeof vi.fn>>;
  let discoveryService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    providerService = {
      findAll: vi.fn().mockResolvedValue([MOCK_PROVIDER]),
      findById: vi.fn().mockResolvedValue(MOCK_PROVIDER),
      create: vi.fn().mockResolvedValue(MOCK_PROVIDER),
      update: vi.fn().mockResolvedValue(MOCK_PROVIDER),
      delete: vi.fn().mockResolvedValue(undefined),
      resetBaseUrl: vi.fn().mockResolvedValue(MOCK_PROVIDER),
    };

    discoveryService = {
      testConnection: vi
        .fn()
        .mockResolvedValue({ success: true, latencyMs: 100 }),
      discoverModels: vi
        .fn()
        .mockResolvedValue([{ id: 'gpt-4o', name: 'gpt-4o' }]),
      lookupModelMetadata: vi.fn().mockResolvedValue(null),
      searchLiteLLMModels: vi.fn().mockResolvedValue([]),
    };

    controller = new LlmProviderController(
      providerService as unknown as LlmProviderService,
      discoveryService as unknown as ModelDiscoveryService,
    );
  });

  // ========== 角色元数据验证 ==========

  // ========== CRUD 方法调用验证 ==========

  describe('findAll', () => {
    it('应当调用 providerService.findAll 并返回 { data }', async () => {
      const result = await controller.findAll(TENANT_ID);

      expect(providerService.findAll).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual({ data: [MOCK_PROVIDER] });
    });
  });

  describe('findById', () => {
    it('应当调用 providerService.findById 并返回 { data }', async () => {
      const result = await controller.findById(PROVIDER_ID, TENANT_ID);

      expect(providerService.findById).toHaveBeenCalledWith(
        PROVIDER_ID,
        TENANT_ID,
      );
      expect(result).toEqual({ data: MOCK_PROVIDER });
    });
  });

  describe('create', () => {
    it('应当调用 providerService.create 并返回 { data }', async () => {
      const dto = { name: 'Custom', baseUrl: 'https://custom.api.com' };
      const result = await controller.create(dto as never, TENANT_ID, USER_ID);

      expect(providerService.create).toHaveBeenCalledWith(
        dto,
        TENANT_ID,
        USER_ID,
      );
      expect(result).toEqual({ data: MOCK_PROVIDER });
    });
  });

  describe('update', () => {
    it('应当调用 providerService.update 并返回 { data }', async () => {
      const dto = { name: 'Updated' };
      const result = await controller.update(
        PROVIDER_ID,
        dto as never,
        TENANT_ID,
        USER_ID,
      );

      expect(providerService.update).toHaveBeenCalledWith(
        PROVIDER_ID,
        dto,
        TENANT_ID,
        USER_ID,
      );
      expect(result).toEqual({ data: MOCK_PROVIDER });
    });
  });

  describe('delete', () => {
    it('应当调用 providerService.delete', async () => {
      await controller.delete(PROVIDER_ID, TENANT_ID);

      expect(providerService.delete).toHaveBeenCalledWith(
        PROVIDER_ID,
        TENANT_ID,
      );
    });
  });

  // ========== Provider Actions ==========

  describe('resetBaseUrl', () => {
    it('应当调用 providerService.resetBaseUrl 并返回 { data }', async () => {
      const result = await controller.resetBaseUrl(PROVIDER_ID, TENANT_ID);

      expect(providerService.resetBaseUrl).toHaveBeenCalledWith(
        PROVIDER_ID,
        TENANT_ID,
      );
      expect(result).toEqual({ data: MOCK_PROVIDER });
    });
  });

  describe('testConnection', () => {
    it('应先获取提供商再调用 testConnection', async () => {
      const result = await controller.testConnection(
        PROVIDER_ID,
        TENANT_ID,
        undefined,
      );

      expect(providerService.findById).toHaveBeenCalledWith(
        PROVIDER_ID,
        TENANT_ID,
      );
      expect(discoveryService.testConnection).toHaveBeenCalledWith(
        MOCK_PROVIDER,
        undefined,
      );
      expect(result).toEqual({ data: { success: true, latencyMs: 100 } });
    });

    it('应将 timeoutMs 传递给 modelDiscoveryService', async () => {
      await controller.testConnection(PROVIDER_ID, TENANT_ID, {
        timeoutMs: 30_000,
      });

      expect(discoveryService.testConnection).toHaveBeenCalledWith(
        MOCK_PROVIDER,
        30_000,
      );
    });
  });

  describe('discoverModels', () => {
    it('应先获取提供商再调用 discoverModels', async () => {
      const result = await controller.discoverModels(PROVIDER_ID, TENANT_ID);

      expect(providerService.findById).toHaveBeenCalledWith(
        PROVIDER_ID,
        TENANT_ID,
      );
      expect(discoveryService.discoverModels).toHaveBeenCalledWith(
        MOCK_PROVIDER,
      );
      expect(result).toEqual({
        data: [{ id: 'gpt-4o', name: 'gpt-4o' }],
      });
    });
  });

  // ========== LiteLLM Metadata ==========

  describe('searchLiteLLMModels', () => {
    it('应先获取提供商再调用 searchLiteLLMModels', async () => {
      const result = await controller.searchLiteLLMModels(
        PROVIDER_ID,
        TENANT_ID,
      );

      expect(providerService.findById).toHaveBeenCalledWith(
        PROVIDER_ID,
        TENANT_ID,
      );
      expect(discoveryService.searchLiteLLMModels).toHaveBeenCalledWith(
        MOCK_PROVIDER.slug,
      );
      expect(result).toEqual({ data: [] });
    });
  });

  describe('lookupModelMetadata', () => {
    it('应调用 lookupModelMetadata 并返回 { data }', async () => {
      const result = await controller.lookupModelMetadata('openai', 'gpt-4o');

      expect(discoveryService.lookupModelMetadata).toHaveBeenCalledWith(
        'openai',
        'gpt-4o',
      );
      expect(result).toEqual({ data: null });
    });
  });
});
