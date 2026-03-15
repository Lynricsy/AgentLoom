import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import {
  LlmModelConfigConflictException,
  LlmModelConfigNotFoundException,
  LlmModelConfigValidationException,
} from '../llm.exceptions';
import { LlmService } from '../llm.service';

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn((db: unknown) => db),
}));

const NOW = new Date('2025-01-01T00:00:00Z');
const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const ORG_ID = '00000000-0000-0000-0000-000000000020';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const CONFIG_ID = '00000000-0000-0000-0000-000000000100';

function createSelectChain(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi
    .fn()
    .mockReturnValue(Object.assign(Promise.resolve(result), { limit }));
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit };
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

function mockConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: CONFIG_ID,
    orgId: ORG_ID,
    tenantId: TENANT_ID,
    name: 'My GPT Config',
    provider: 'openai',
    modelName: 'gpt-4o',
    parameters: {},
    apiKeyId: null,
    endpointUrl: null,
    authMethod: null,
    authConfig: null,
    timeoutMs: null,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('LlmService', () => {
  let service: LlmService;
  let db: Record<string, ReturnType<typeof vi.fn>>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [LlmService, { provide: DRIZZLE, useValue: db }],
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

      const result = await service.create(
        {
          name: 'My GPT Config',
          provider: 'openai',
          modelName: 'gpt-4o',
          parameters: {},
          isDefault: false,
        },
        TENANT_ID,
        USER_ID,
      );

      expect(result.id).toBe(CONFIG_ID);
      expect(result.name).toBe('My GPT Config');
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG_ID,
          tenantId: TENANT_ID,
          name: 'My GPT Config',
          provider: 'openai',
          modelName: 'gpt-4o',
        }),
      );
    });

    it('应当在创建 private_cloud 配置时写入新增列', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      db.select.mockReturnValueOnce(createSelectChain([]));

      const insertChain = createInsertChain([
        mockConfig({
          provider: 'private_cloud',
          modelName: 'private-model',
          apiKeyId: 'api-key-id',
          endpointUrl: 'https://private-cloud.example.com/v1',
          authMethod: 'api_key',
          authConfig: null,
          timeoutMs: 30_000,
        }),
      ]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.create(
        {
          name: 'Private Cloud Config',
          provider: 'private_cloud',
          modelName: 'private-model',
          parameters: {},
          isDefault: false,
          apiKeyId: 'api-key-id',
          endpointUrl: 'https://private-cloud.example.com/v1',
          authMethod: 'api_key',
          authConfig: { apiKey: 'secret-key' },
          timeoutMs: 30_000,
        },
        TENANT_ID,
        USER_ID,
      );

      expect(result.provider).toBe('private_cloud');
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG_ID,
          tenantId: TENANT_ID,
          name: 'Private Cloud Config',
          provider: 'private_cloud',
          modelName: 'private-model',
          apiKeyId: 'api-key-id',
          endpointUrl: 'https://private-cloud.example.com/v1',
          authMethod: 'api_key',
          authConfig: null,
          timeoutMs: 30_000,
        }),
      );
    });

    it('应当在 private_cloud 使用 api_key 且缺少 apiKeyId 时抛出验证错误', async () => {
      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.create(
          {
            name: 'Private Cloud Config',
            provider: 'private_cloud',
            modelName: 'private-model',
            parameters: {},
            isDefault: false,
            endpointUrl: 'https://private-cloud.example.com/v1',
            authMethod: 'api_key',
          },
          TENANT_ID,
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(LlmModelConfigValidationException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('应当在非 private_cloud provider 时清空私有云专属字段', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      db.select.mockReturnValueOnce(createSelectChain([]));

      const insertChain = createInsertChain([mockConfig()]);
      db.insert.mockReturnValueOnce(insertChain);

      await service.create(
        {
          name: 'OpenAI Config',
          provider: 'openai',
          modelName: 'gpt-4o',
          parameters: {},
          isDefault: false,
          endpointUrl: 'https://should-be-cleared.example.com',
          authMethod: 'none',
          authConfig: { leaked: true },
          timeoutMs: 15_000,
        },
        TENANT_ID,
        USER_ID,
      );

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointUrl: null,
          authMethod: null,
          authConfig: null,
          timeoutMs: null,
        }),
      );
    });

    it('应当在名称冲突时抛出 409', async () => {
      // org lookup
      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      // name uniqueness → conflict exists
      db.select.mockReturnValueOnce(createSelectChain([{ id: 'existing-id' }]));

      await expect(
        service.create(
          {
            name: 'Dup',
            provider: 'openai',
            modelName: 'gpt-4o',
            parameters: {},
            isDefault: false,
          },
          TENANT_ID,
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(LlmModelConfigConflictException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('应当在无关联组织时抛出错误', async () => {
      // org lookup → empty
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.create(
          {
            name: 'X',
            provider: 'openai',
            modelName: 'gpt-4o',
            parameters: {},
            isDefault: false,
          },
          TENANT_ID,
          USER_ID,
        ),
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
        {
          name: 'My GPT Config',
          provider: 'openai',
          modelName: 'gpt-4o',
          parameters: {},
          isDefault: true,
        },
        TENANT_ID,
        USER_ID,
      );

      expect(result.isDefault).toBe(true);
      expect(db.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('应当返回所有模型配置', async () => {
      const configs = [
        mockConfig(),
        mockConfig({ id: 'id-2', name: 'Config 2' }),
      ];

      // org lookup
      db.select.mockReturnValueOnce(createSelectChain([{ id: ORG_ID }]));
      // list
      db.select.mockReturnValueOnce(createSelectChain(configs));

      const result = await service.findAll(TENANT_ID);
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
    it('应当返回指定配置', async () => {
      db.select.mockReturnValueOnce(createSelectChain([mockConfig()]));

      const result = await service.findById(CONFIG_ID, TENANT_ID);
      expect(result.id).toBe(CONFIG_ID);
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

      // findById
      db.select.mockReturnValueOnce(createSelectChain([mockConfig()]));
      // update (no name change, no isDefault change → straight to update)
      const updated = mockConfig({ modelName: 'gpt-4o-mini' });
      db.update.mockReturnValueOnce(createUpdateChain([updated]));

      const result = await service.update(
        CONFIG_ID,
        { modelName: 'gpt-4o-mini' },
        TENANT_ID,
      );
      expect(result.modelName).toBe('gpt-4o-mini');
    });

    it('应当在更新时写入 private_cloud 新增列', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      db.select.mockReturnValueOnce(createSelectChain([mockConfig()]));
      const updateChain = createUpdateChain([
        mockConfig({
          provider: 'private_cloud',
          apiKeyId: 'api-key-id',
          endpointUrl: 'https://private-cloud.example.com/v1',
          authMethod: 'api_key',
          authConfig: null,
          timeoutMs: 45_000,
        }),
      ]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.update(
        CONFIG_ID,
        {
          provider: 'private_cloud',
          apiKeyId: 'api-key-id',
          endpointUrl: 'https://private-cloud.example.com/v1',
          authMethod: 'api_key',
          authConfig: { apiKey: 'secret-key' },
          timeoutMs: 45_000,
        },
        TENANT_ID,
      );

      expect(result.endpointUrl).toBe('https://private-cloud.example.com/v1');
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyId: 'api-key-id',
          endpointUrl: 'https://private-cloud.example.com/v1',
          authMethod: 'api_key',
          authConfig: null,
          timeoutMs: 45_000,
          updatedAt: NOW,
        }),
      );
    });

    it('应当在更新时允许将 private_cloud 新增列清空为 null', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      db.select.mockReturnValueOnce(
        createSelectChain([
          mockConfig({
            apiKeyId: 'legacy-api-key-id',
            endpointUrl: 'https://private-cloud.example.com/v1',
            authMethod: 'mtls',
            authConfig: { clientCert: 'cert-data' },
            timeoutMs: 60_000,
          }),
        ]),
      );

      const updateChain = createUpdateChain([
        mockConfig({
          endpointUrl: null,
          authMethod: null,
          authConfig: null,
          timeoutMs: null,
        }),
      ]);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.update(
        CONFIG_ID,
        {
          endpointUrl: null,
          authMethod: null,
          authConfig: null,
          timeoutMs: null,
        },
        TENANT_ID,
      );

      expect(result.endpointUrl).toBeNull();
      expect(result.authMethod).toBeNull();
      expect(result.authConfig).toBeNull();
      expect(result.timeoutMs).toBeNull();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyId: null,
          endpointUrl: null,
          authMethod: null,
          authConfig: null,
          timeoutMs: null,
          updatedAt: NOW,
        }),
      );
    });

    it('应当在更新为 private_cloud api_key 且缺少 apiKeyId 时抛出验证错误', async () => {
      db.select.mockReturnValueOnce(createSelectChain([mockConfig()]));

      await expect(
        service.update(
          CONFIG_ID,
          {
            provider: 'private_cloud',
            endpointUrl: 'https://private-cloud.example.com/v1',
            authMethod: 'api_key',
          },
          TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(LlmModelConfigValidationException);

      expect(db.update).not.toHaveBeenCalled();
    });

    it('应当在更新为非 private_cloud provider 时清空私有云字段', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      db.select.mockReturnValueOnce(
        createSelectChain([
          mockConfig({
            provider: 'private_cloud',
            apiKeyId: 'api-key-id',
            endpointUrl: 'https://private-cloud.example.com/v1',
            authMethod: 'api_key',
            authConfig: null,
            timeoutMs: 60_000,
          }),
        ]),
      );

      const updateChain = createUpdateChain([
        mockConfig({
          provider: 'openai',
          endpointUrl: null,
          authMethod: null,
          authConfig: null,
          timeoutMs: null,
        }),
      ]);
      db.update.mockReturnValueOnce(updateChain);

      await service.update(
        CONFIG_ID,
        {
          provider: 'openai',
        },
        TENANT_ID,
      );

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointUrl: null,
          authMethod: null,
          authConfig: null,
          timeoutMs: null,
          updatedAt: NOW,
        }),
      );
    });

    it('应当在名称冲突时抛出 409', async () => {
      // findById
      db.select.mockReturnValueOnce(createSelectChain([mockConfig()]));
      // name conflict check → conflict exists
      db.select.mockReturnValueOnce(createSelectChain([{ id: 'other-id' }]));

      await expect(
        service.update(CONFIG_ID, { name: 'Conflict' }, TENANT_ID),
      ).rejects.toBeInstanceOf(LlmModelConfigConflictException);
    });

    it('应当在 isDefault=true 时清除其他默认配置', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      // findById
      db.select.mockReturnValueOnce(createSelectChain([mockConfig()]));
      // clearDefaultInOrg
      db.update.mockReturnValueOnce(createUpdateChain());
      db.update.mockReturnValueOnce(
        createUpdateChain([mockConfig({ isDefault: true })]),
      );

      const result = await service.update(
        CONFIG_ID,
        { isDefault: true },
        TENANT_ID,
      );
      expect(result.isDefault).toBe(true);
      expect(db.update).toHaveBeenCalledTimes(2);
    });

    it('应当在未找到时抛出 404', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.update('non-existent', { name: 'X' }, TENANT_ID),
      ).rejects.toBeInstanceOf(LlmModelConfigNotFoundException);
    });
  });

  describe('delete', () => {
    it('应当删除模型配置', async () => {
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      db.select.mockReturnValueOnce(createSelectChain([mockConfig()]));
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
