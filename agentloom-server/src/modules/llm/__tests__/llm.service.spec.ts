import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import type { CreateLlmModelConfigDto } from '../dto/create-llm-model-config.dto';
import type { UpdateLlmModelConfigDto } from '../dto/update-llm-model-config.dto';
import {
  LlmModelConfigConflictException,
  LlmModelConfigNotFoundException,
  LlmModelConfigValidationException,
} from '../llm.exceptions';
import { LlmProviderService } from '../llm-provider.service';
import { LlmService } from '../llm.service';

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn((db: unknown) => db),
}));

const NOW = new Date('2025-01-01T00:00:00Z');
const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const ORG_ID = '00000000-0000-0000-0000-000000000020';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const CONFIG_ID = '00000000-0000-0000-0000-000000000100';
const PROVIDER_ID = '00000000-0000-0000-0000-000000000200';

function createSelectChain(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi
    .fn()
    .mockReturnValue(Object.assign(Promise.resolve(result), { limit }));
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ where, innerJoin });
  return { from, where, limit, innerJoin };
}

function createInsertChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createUpdateChain(result?: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi
    .fn()
    .mockReturnValue(Object.assign(Promise.resolve(result), { returning }));
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function createDeleteChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  return { where };
}

function mockProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: PROVIDER_ID,
    orgId: ORG_ID,
    tenantId: TENANT_ID,
    slug: 'openai',
    name: 'OpenAI',
    iconUrl: null,
    baseUrl: null,
    defaultBaseUrl: null,
    isBuiltin: true,
    isEnabled: true,
    apiProtocol: 'openai_chat' as const,
    apiKeyId: null,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function mockConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: CONFIG_ID,
    orgId: ORG_ID,
    tenantId: TENANT_ID,
    name: 'My GPT Config',
    providerId: PROVIDER_ID,
    modelId: 'gpt-4o',
    parameters: {},
    isEnabled: true,
    isDefault: false,
    capabilities: {},
    contextWindow: null,
    maxOutputTokens: null,
    pricing: null,
    metadataSource: null,
    timeoutMs: null,
    modelType: 'chat' as const,
    embeddingDimensions: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** findById / findAll 等 join 查询返回的行格式 */
function mockJoinRow(
  configOverrides: Record<string, unknown> = {},
  providerOverrides: Record<string, unknown> = {},
) {
  return {
    config: mockConfig(configOverrides),
    provider: mockProvider(providerOverrides),
  };
}

/** 构造 CreateLlmModelConfigDto 测试数据，自动填充 Zod default 字段 */
function createDto(
  overrides: Record<string, unknown> = {},
): CreateLlmModelConfigDto {
  return {
    name: 'My GPT Config',
    providerId: PROVIDER_ID,
    modelId: 'gpt-4o',
    parameters: {},
    modelType: 'chat',
    isDefault: false,
    isEnabled: true,
    capabilities: {},
    ...overrides,
  } as CreateLlmModelConfigDto;
}

/** 构造 UpdateLlmModelConfigDto 测试数据 */
function updateDto(
  overrides: Record<string, unknown> = {},
): UpdateLlmModelConfigDto {
  return overrides as unknown as UpdateLlmModelConfigDto;
}

describe('LlmService', () => {
  let service: LlmService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let llmProviderService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    llmProviderService = {
      syncBuiltinProviders: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        { provide: DRIZZLE, useValue: db },
        { provide: LlmProviderService, useValue: llmProviderService },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('应当创建 LLM 模型配置并返回结果', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      // org lookup
      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      // name uniqueness check → no conflict
      db.select.mockReturnValueOnce(createSelectChain([]));
      // insert
      const insertChain = createInsertChain([mockConfig()]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.create(createDto(), TENANT_ID, USER_ID);

      expect(result.id).toBe(CONFIG_ID);
      expect(result.name).toBe('My GPT Config');
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG_ID,
          tenantId: TENANT_ID,
          name: 'My GPT Config',
          providerId: PROVIDER_ID,
          modelId: 'gpt-4o',
        }),
      );
    });

    it('应当在名称冲突时抛出 409', async () => {
      // org lookup
      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      // name uniqueness → conflict exists
      db.select.mockReturnValueOnce(createSelectChain([{ id: 'existing-id' }]));

      await expect(
        service.create(createDto({ name: 'Dup' }), TENANT_ID, USER_ID),
      ).rejects.toBeInstanceOf(LlmModelConfigConflictException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('应当在无关联组织时抛出错误', async () => {
      // org lookup → empty
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.create(createDto({ name: 'X' }), TENANT_ID, USER_ID),
      ).rejects.toThrow('当前租户无关联组织');
    });

    it('应当在 isDefault=true 时清除其他默认配置', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      // org lookup
      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      // name uniqueness → no conflict
      db.select.mockReturnValueOnce(createSelectChain([]));
      // clearDefaultInOrg
      db.update.mockReturnValueOnce(createUpdateChain());
      // insert
      db.insert.mockReturnValueOnce(
        createInsertChain([mockConfig({ isDefault: true })]),
      );

      const result = await service.create(
        createDto({ isDefault: true }),
        TENANT_ID,
        USER_ID,
      );

      expect(result.isDefault).toBe(true);
      expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('应当在 embedding 模型缺少维度时抛出验证错误', async () => {
      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.create(
          createDto({
            name: 'Embed Config',
            modelId: 'text-embedding-3-small',
            modelType: 'embedding',
          }),
          TENANT_ID,
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(LlmModelConfigValidationException);

      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('应当返回所有模型配置', async () => {
      const rows = [
        mockJoinRow(),
        mockJoinRow({ id: 'id-2', name: 'Config 2' }),
      ];

      // org lookup
      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      // list with join
      db.select.mockReturnValueOnce(createSelectChain(rows));

      const result = await service.findAll(TENANT_ID);
      expect(llmProviderService.syncBuiltinProviders).toHaveBeenCalledWith(
        ORG_ID,
        TENANT_ID,
      );
      expect(result).toHaveLength(2);
    });

    it('应当在无组织时返回空数组', async () => {
      // org lookup → empty
      db.select.mockReturnValueOnce(createSelectChain([]));

      const result = await service.findAll(TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('应当返回指定配置（含 provider）', async () => {
      db.select.mockReturnValueOnce(createSelectChain([mockJoinRow()]));

      const result = await service.findById(CONFIG_ID, TENANT_ID);
      expect(result.id).toBe(CONFIG_ID);
      expect(result.provider.slug).toBe('openai');
    });

    it('应当在未找到时抛出 404', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.findById('non-existent', TENANT_ID),
      ).rejects.toBeInstanceOf(LlmModelConfigNotFoundException);
    });
  });

  describe('update', () => {
    it('应当更新模型配置', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      // findById (join query)
      db.select.mockReturnValueOnce(createSelectChain([mockJoinRow()]));
      // update
      const updated = mockConfig({ modelId: 'gpt-4o-mini' });
      db.update.mockReturnValueOnce(createUpdateChain([updated]));

      const result = await service.update(
        CONFIG_ID,
        updateDto({ modelId: 'gpt-4o-mini' }),
        TENANT_ID,
      );
      expect(result.modelId).toBe('gpt-4o-mini');
    });

    it('应当在名称冲突时抛出 409', async () => {
      // findById
      db.select.mockReturnValueOnce(createSelectChain([mockJoinRow()]));
      // name conflict check → conflict exists
      db.select.mockReturnValueOnce(createSelectChain([{ id: 'other-id' }]));

      await expect(
        service.update(CONFIG_ID, updateDto({ name: 'Conflict' }), TENANT_ID),
      ).rejects.toBeInstanceOf(LlmModelConfigConflictException);
    });

    it('应当在 isDefault=true 时清除其他默认配置', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      // findById
      db.select.mockReturnValueOnce(createSelectChain([mockJoinRow()]));
      // clearDefaultInOrg
      db.update.mockReturnValueOnce(createUpdateChain());
      db.update.mockReturnValueOnce(
        createUpdateChain([mockConfig({ isDefault: true })]),
      );

      const result = await service.update(
        CONFIG_ID,
        updateDto({ isDefault: true }),
        TENANT_ID,
      );
      expect(result.isDefault).toBe(true);
      expect(db.update).toHaveBeenCalledTimes(2);
    });

    it('应当在未找到时抛出 404', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.update('non-existent', updateDto({ name: 'X' }), TENANT_ID),
      ).rejects.toBeInstanceOf(LlmModelConfigNotFoundException);
    });
  });

  describe('delete', () => {
    it('应当删除模型配置', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      db.select.mockReturnValueOnce(createSelectChain([mockJoinRow()]));
      db.delete.mockReturnValueOnce(createDeleteChain());

      await service.delete(CONFIG_ID, TENANT_ID);
      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it('应当在未找到时抛出 404', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.delete('non-existent', TENANT_ID),
      ).rejects.toBeInstanceOf(LlmModelConfigNotFoundException);
    });
  });
});
