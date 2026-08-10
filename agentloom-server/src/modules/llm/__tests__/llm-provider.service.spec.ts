import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { llmProviders } from '../../../database/schema/llm-providers.schema';
import { ApiKeyService } from '../../api-key/api-key.service';
import { LlmProviderService } from '../llm-provider.service';
import {
  LlmProviderDeletionForbiddenException,
  LlmProviderNotFoundException,
  LlmProviderSlugConflictException,
} from '../llm.exceptions';

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn((db: unknown) => db),
}));

const NOW = new Date('2026-04-02T00:00:00Z');
const TENANT_ID = '00000000-0000-0000-0000-000000000010';
const ORG_ID = '00000000-0000-0000-0000-000000000020';
const SENTINEL_ORG_ID = '00000000-0000-0000-0000-000000000000';

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createSelectChainWithLimit(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createInsertChain() {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  return { values, onConflictDoNothing };
}

function createUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

function createBuiltinProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'provider-sentinel-openai',
    orgId: SENTINEL_ORG_ID,
    tenantId: SENTINEL_ORG_ID,
    slug: 'openai',
    name: 'OpenAI',
    iconUrl:
      'https://unpkg.com/@lobehub/icons-static-png@latest/dark/openai.png',
    baseUrl: 'https://api.openai.com',
    defaultBaseUrl: 'https://api.openai.com',
    isBuiltin: true,
    isEnabled: true,
    apiProtocol: 'openai_responses' as const,
    apiKeyId: null,
    sortOrder: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('LlmProviderService', () => {
  let service: LlmProviderService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let apiKeyService: Record<string, ReturnType<typeof vi.fn>>;

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
    apiKeyService = {
      createStoredKey: vi.fn(),
      findByIdInternal: vi.fn(),
      rotateStoredKey: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmProviderService,
        { provide: DRIZZLE, useValue: db },
        { provide: ApiKeyService, useValue: apiKeyService },
      ],
    }).compile();

    service = module.get<LlmProviderService>(LlmProviderService);
  });

  it('应当补齐缺失的 builtin provider，并为旧 builtin 行回填缺失图标与默认 URL', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const sentinelOpenai = createBuiltinProvider();
    const sentinelAnthropic = createBuiltinProvider({
      id: 'provider-sentinel-anthropic',
      slug: 'anthropic',
      name: 'Anthropic',
      iconUrl:
        'https://unpkg.com/@lobehub/icons-static-png@latest/dark/claude-color.png',
      baseUrl: 'https://api.anthropic.com',
      defaultBaseUrl: 'https://api.anthropic.com',
      apiProtocol: 'anthropic' as const,
      sortOrder: 2,
    });

    const legacyAnthropic = {
      ...sentinelAnthropic,
      id: 'provider-org-anthropic',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      iconUrl: 'https://icons.lobehub.com/icons/anthropic/color.svg',
      baseUrl: null,
      defaultBaseUrl: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const customPrivateCloud = {
      id: 'provider-org-private-cloud',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      slug: 'private_cloud',
      name: 'Private Cloud',
      iconUrl: null,
      baseUrl: 'https://models.example.test',
      defaultBaseUrl: null,
      isBuiltin: false,
      isEnabled: true,
      apiProtocol: 'openai_chat' as const,
      apiKeyId: null,
      sortOrder: 99,
      createdAt: NOW,
      updatedAt: NOW,
    };

    db.select
      .mockReturnValueOnce(
        createSelectChain([sentinelOpenai, sentinelAnthropic]),
      )
      .mockReturnValueOnce(
        createSelectChain([legacyAnthropic, customPrivateCloud]),
      );

    const insertChain = createInsertChain();
    const updateChain = createUpdateChain();
    db.insert.mockReturnValue(insertChain);
    db.update.mockReturnValue(updateChain);

    await service.syncBuiltinProviders(ORG_ID, TENANT_ID);

    expect(insertChain.values).toHaveBeenCalledTimes(1);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        tenantId: TENANT_ID,
        slug: 'openai',
        iconUrl: sentinelOpenai.iconUrl,
        baseUrl: sentinelOpenai.baseUrl,
        defaultBaseUrl: sentinelOpenai.defaultBaseUrl,
        isBuiltin: true,
      }),
    );
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledWith({
      target: [llmProviders.orgId, llmProviders.slug],
    });

    expect(updateChain.set).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        iconUrl: sentinelAnthropic.iconUrl,
        baseUrl: sentinelAnthropic.baseUrl,
        defaultBaseUrl: sentinelAnthropic.defaultBaseUrl,
        updatedAt: NOW,
      }),
    );
  });

  it('应当跳过占用 builtin slug 的自定义 provider，避免覆盖用户配置', async () => {
    const sentinelOpenai = createBuiltinProvider();
    const customOpenai = {
      ...sentinelOpenai,
      id: 'provider-org-custom-openai',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      name: 'My OpenAI Proxy',
      iconUrl: 'https://example.com/custom-openai.svg',
      baseUrl: 'https://proxy.example.com',
      defaultBaseUrl: 'https://proxy.example.com',
      isBuiltin: false,
    };

    db.select
      .mockReturnValueOnce(createSelectChain([sentinelOpenai]))
      .mockReturnValueOnce(createSelectChain([customOpenai]));

    db.insert.mockReturnValue(createInsertChain());
    db.update.mockReturnValue(createUpdateChain());

    await service.syncBuiltinProviders(ORG_ID, TENANT_ID);

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('创建 provider 时若直接提供 apiKey，应创建受管密钥并写入 apiKeyId', async () => {
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([]));

    const insertChain = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 'provider-custom',
            orgId: ORG_ID,
            tenantId: TENANT_ID,
            slug: 'my-proxy',
            name: 'My Proxy',
            baseUrl: 'https://proxy.example.com',
            defaultBaseUrl: 'https://proxy.example.com',
            isBuiltin: false,
            isEnabled: true,
            apiProtocol: 'openai_chat' as const,
            apiKeyId: 'managed-key-1',
            iconUrl: null,
            sortOrder: 0,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ]),
      }),
    };
    db.insert.mockReturnValue(insertChain);
    apiKeyService.findByIdInternal.mockResolvedValue(undefined);
    apiKeyService.createStoredKey.mockResolvedValue({ id: 'managed-key-1' });

    const result = await service.create(
      {
        name: 'My Proxy',
        baseUrl: 'https://proxy.example.com',
        apiKey: 'sk-managed',
      } as never,
      TENANT_ID,
      'user-id',
    );

    expect(apiKeyService.createStoredKey).toHaveBeenCalledWith(
      {
        provider: 'my-proxy',
        label: 'LLM Provider / my-proxy',
        apiKey: 'sk-managed',
        isDefault: false,
      },
      'user-id',
      TENANT_ID,
    );
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'managed-key-1',
      }),
    );
    expect(result.apiKeyId).toBe('managed-key-1');
  });

  it('更新 provider 时若 clearApiKey=true，应清空绑定的 apiKeyId', async () => {
    const existing = {
      id: 'provider-custom',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      slug: 'my-proxy',
      name: 'My Proxy',
      iconUrl: null,
      baseUrl: 'https://proxy.example.com',
      defaultBaseUrl: 'https://proxy.example.com',
      isBuiltin: false,
      isEnabled: true,
      apiProtocol: 'openai_chat' as const,
      apiKeyId: 'managed-key-1',
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };

    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([existing]))
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]));

    const updateChain = {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              ...existing,
              apiKeyId: null,
              updatedAt: NOW,
            },
          ]),
        }),
      }),
    };
    db.update.mockReturnValue(updateChain);

    const result = await service.update(
      existing.id,
      { clearApiKey: true } as never,
      TENANT_ID,
      'user-id',
    );

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: null,
        updatedAt: NOW,
      }),
    );
    expect(result.apiKeyId).toBeNull();
  });

  it('findAll 解析组织、同步 builtin 并返回排序查询结果', async () => {
    const rows = [
      createBuiltinProvider({ orgId: ORG_ID, tenantId: TENANT_ID }),
    ];
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([]));
    const listChain = createSelectChain(rows) as ReturnType<
      typeof createSelectChain
    > & { orderBy?: ReturnType<typeof vi.fn> };
    listChain.orderBy = vi.fn().mockResolvedValue(rows);
    listChain.where.mockReturnValue({ orderBy: listChain.orderBy });
    db.select.mockReturnValueOnce(listChain);

    await expect(service.findAll(TENANT_ID)).resolves.toEqual(rows);
    expect(listChain.orderBy).toHaveBeenCalledTimes(1);
  });

  it('findById 找不到组织内 provider 时抛出 not-found 异常', async () => {
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([]));

    const error = await service
      .findById('missing-provider', TENANT_ID)
      .catch((value) => value);

    expect(error).toBeInstanceOf(LlmProviderNotFoundException);
    expect(error.detail).toContain('missing-provider');
  });

  it('findById 返回组织内匹配 provider', async () => {
    const existing = createBuiltinProvider({
      id: 'provider-org',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
    });
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([existing]));

    await expect(service.findById(existing.id, TENANT_ID)).resolves.toBe(
      existing,
    );
  });

  it('无法从 tenant 解析组织时拒绝 CRUD', async () => {
    db.select.mockReturnValue(createSelectChainWithLimit([]));

    await expect(service.findById('provider', TENANT_ID)).rejects.toThrow(
      '当前租户无关联组织',
    );
  });

  it('create 自动规范化 slug 并应用所有默认字段', async () => {
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([]));
    const created = {
      ...createBuiltinProvider({
        id: 'custom-id',
        orgId: ORG_ID,
        tenantId: TENANT_ID,
        slug: 'my-proxy-provider',
        name: 'My Proxy Provider!',
        isBuiltin: false,
        apiProtocol: 'openai_chat',
        iconUrl: null,
        sortOrder: 0,
      }),
    };
    const returning = vi.fn().mockResolvedValue([created]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert.mockReturnValue({ values });

    const result = await service.create(
      {
        name: 'My Proxy Provider!',
        baseUrl: 'https://proxy.test/v1',
      } as never,
      TENANT_ID,
      'user-id',
    );

    expect(values).toHaveBeenCalledWith({
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      slug: 'my-proxy-provider',
      name: 'My Proxy Provider!',
      baseUrl: 'https://proxy.test/v1',
      defaultBaseUrl: 'https://proxy.test/v1',
      isBuiltin: false,
      isEnabled: true,
      apiProtocol: 'openai_chat',
      apiKeyId: null,
      iconUrl: null,
      sortOrder: 0,
    });
    expect(apiKeyService.createStoredKey).not.toHaveBeenCalled();
    expect(result).toBe(created);
  });

  it('create 尊重显式 slug、apiKeyId 与可选字段', async () => {
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([]));
    const returning = vi.fn().mockResolvedValue([
      createBuiltinProvider({
        id: 'custom-id',
        slug: 'explicit',
        orgId: ORG_ID,
        tenantId: TENANT_ID,
        isBuiltin: false,
      }),
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert.mockReturnValue({ values });

    await service.create(
      {
        name: 'Explicit',
        slug: 'explicit',
        baseUrl: 'https://explicit.test',
        apiProtocol: 'cohere',
        apiKeyId: 'explicit-key-id',
        apiKey: '   ',
        iconUrl: 'https://explicit.test/icon.svg',
        sortOrder: 9,
        isEnabled: false,
      } as never,
      TENANT_ID,
      'user-id',
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'explicit',
        apiProtocol: 'cohere',
        apiKeyId: 'explicit-key-id',
        iconUrl: 'https://explicit.test/icon.svg',
        sortOrder: 9,
        isEnabled: false,
      }),
    );
  });

  it('create 检测组织内 slug 冲突且不写入', async () => {
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([{ id: 'conflict' }]));

    const error = await service
      .create(
        {
          name: 'Duplicate',
          slug: 'openai',
          baseUrl: 'https://x.test',
        } as never,
        TENANT_ID,
        'user-id',
      )
      .catch((value) => value);

    expect(error).toBeInstanceOf(LlmProviderSlugConflictException);
    expect(error.detail).toContain('openai');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('update 拒绝被其他 provider 占用的新 slug', async () => {
    const existing = createBuiltinProvider({
      id: 'custom-id',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      slug: 'old-slug',
      isBuiltin: false,
    });
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([existing]))
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([{ id: 'other-id' }]));

    await expect(
      service.update(
        existing.id,
        { slug: 'occupied' } as never,
        TENANT_ID,
        'user-id',
      ),
    ).rejects.toBeInstanceOf(LlmProviderSlugConflictException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('update 允许保持自己的 slug，并只写入显式字段', async () => {
    const existing = createBuiltinProvider({
      id: 'custom-id',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      slug: 'same-slug',
      isBuiltin: false,
      apiKeyId: null,
    });
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([existing]))
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([{ id: existing.id }]));
    const updated = {
      ...existing,
      name: 'Updated',
      baseUrl: null,
      apiProtocol: 'google' as const,
      iconUrl: 'https://icons.test/new.svg',
      sortOrder: 7,
      isEnabled: false,
    };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update.mockReturnValue({ set });

    await service.update(
      existing.id,
      {
        name: 'Updated',
        slug: 'same-slug',
        baseUrl: null,
        apiProtocol: 'google',
        apiKeyId: 'explicit-new-key',
        iconUrl: 'https://icons.test/new.svg',
        sortOrder: 7,
        isEnabled: false,
      } as never,
      TENANT_ID,
      'user-id',
    );

    expect(set).toHaveBeenCalledWith({
      updatedAt: NOW,
      name: 'Updated',
      slug: 'same-slug',
      baseUrl: null,
      apiProtocol: 'google',
      apiKeyId: 'explicit-new-key',
      iconUrl: 'https://icons.test/new.svg',
      sortOrder: 7,
      isEnabled: false,
    });
  });

  it('update 旋转匹配的受管密钥', async () => {
    const existing = createBuiltinProvider({
      id: 'custom-id',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      slug: 'proxy',
      isBuiltin: false,
      apiKeyId: 'managed-key',
    });
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([existing]))
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]));
    apiKeyService.findByIdInternal.mockResolvedValue({
      id: 'managed-key',
      provider: 'proxy',
      label: 'LLM Provider / proxy',
      isDefault: false,
      status: 'active',
    });
    apiKeyService.rotateStoredKey.mockResolvedValue({ id: 'rotated-key' });
    const returning = vi
      .fn()
      .mockResolvedValue([{ ...existing, apiKeyId: 'rotated-key' }]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    db.update.mockReturnValue({ set });

    await service.update(
      existing.id,
      { apiKey: '  replacement-secret  ' } as never,
      TENANT_ID,
      'user-id',
    );

    expect(apiKeyService.rotateStoredKey).toHaveBeenCalledWith(
      'managed-key',
      'replacement-secret',
      TENANT_ID,
      'user-id',
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyId: 'rotated-key' }),
    );
    expect(apiKeyService.createStoredKey).not.toHaveBeenCalled();
  });

  it.each([
    ['provider', 'different'],
    ['label', 'Different label'],
    ['default', true],
    ['status', 'revoked'],
  ])('update 在受管密钥 %s 不匹配时新建密钥', async (field, mismatch) => {
    const existing = createBuiltinProvider({
      id: `custom-${field}`,
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      slug: 'proxy',
      isBuiltin: false,
      apiKeyId: 'old-key',
    });
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([existing]))
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]));
    apiKeyService.findByIdInternal.mockResolvedValue({
      id: 'old-key',
      provider: field === 'provider' ? mismatch : 'proxy',
      label: field === 'label' ? mismatch : 'LLM Provider / proxy',
      isDefault: field === 'default' ? mismatch : false,
      status: field === 'status' ? mismatch : 'active',
    });
    apiKeyService.createStoredKey.mockResolvedValue({ id: 'new-key' });
    const returning = vi
      .fn()
      .mockResolvedValue([{ ...existing, apiKeyId: 'new-key' }]);
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning }),
      }),
    });

    await service.update(
      existing.id,
      { apiKey: 'new-secret' } as never,
      TENANT_ID,
      'user-id',
    );

    expect(apiKeyService.createStoredKey).toHaveBeenCalledWith(
      {
        provider: 'proxy',
        label: 'LLM Provider / proxy',
        apiKey: 'new-secret',
        isDefault: false,
      },
      'user-id',
      TENANT_ID,
    );
    expect(apiKeyService.rotateStoredKey).not.toHaveBeenCalled();
  });

  it('delete 禁止删除 builtin provider', async () => {
    const builtin = createBuiltinProvider({
      id: 'builtin-org',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
    });
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([builtin]));

    await expect(service.delete(builtin.id, TENANT_ID)).rejects.toBeInstanceOf(
      LlmProviderDeletionForbiddenException,
    );
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('delete 删除组织内自定义 provider', async () => {
    const custom = createBuiltinProvider({
      id: 'custom-org',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      slug: 'custom',
      isBuiltin: false,
    });
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([custom]))
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]));
    const where = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where });

    await expect(service.delete(custom.id, TENANT_ID)).resolves.toBeUndefined();
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('resetBaseUrl 将 baseUrl 清空并返回更新行', async () => {
    const existing = createBuiltinProvider({
      id: 'builtin-org',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
    });
    const updated = { ...existing, baseUrl: null };
    db.select
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
      .mockReturnValueOnce(createSelectChain([existing]))
      .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]));
    const returning = vi.fn().mockResolvedValue([updated]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    db.update.mockReturnValue({ set });

    await expect(service.resetBaseUrl(existing.id, TENANT_ID)).resolves.toBe(
      updated,
    );
    expect(set).toHaveBeenCalledWith({ baseUrl: null, updatedAt: NOW });
  });

  it('syncBuiltinProviders 在 sentinel 为空时跳过组织查询和写入', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    db.select.mockReturnValueOnce(createSelectChain([]));

    await service.syncBuiltinProviders(ORG_ID, TENANT_ID);

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('syncBuiltinProviders 对元数据完整且相同的 builtin 不更新', async () => {
    const sentinel = createBuiltinProvider();
    const existing = {
      ...sentinel,
      id: 'builtin-org',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
    };
    db.select
      .mockReturnValueOnce(createSelectChain([sentinel]))
      .mockReturnValueOnce(createSelectChain([existing]));

    await service.syncBuiltinProviders(ORG_ID, TENANT_ID);

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'missing icon'],
    [
      'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai.svg',
      'old svg',
    ],
    [
      'https://unpkg.com/@lobehub/icons-static-png@latest/light/openai.png',
      'old png',
    ],
  ])('syncBuiltinProviders 替换 %s 图标', async (iconUrl, _caseName) => {
    const sentinel = createBuiltinProvider();
    const existing = {
      ...sentinel,
      id: 'builtin-org',
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      iconUrl,
    };
    db.select
      .mockReturnValueOnce(createSelectChain([sentinel]))
      .mockReturnValueOnce(createSelectChain([existing]));
    const updateChain = createUpdateChain();
    db.update.mockReturnValue(updateChain);

    await service.syncBuiltinProviders(ORG_ID, TENANT_ID);

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ iconUrl: sentinel.iconUrl }),
    );
  });
});
