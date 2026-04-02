import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { ApiKeyService } from '../../api-key/api-key.service';
import { LlmProviderService } from '../llm-provider.service';

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
  const values = vi.fn().mockResolvedValue(undefined);
  return { values };
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
});
