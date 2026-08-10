import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentCanvasUnknownNodeTypeException } from '../agent-definition/agent-definition.exceptions';
import { AgentShareImportService } from './agent-share-import.service';
import {
  ShareExpiredException,
  ShareNotFoundException,
  ShareRevokedException,
} from './share.exceptions';

const mocks = vi.hoisted(() => ({
  uuid: 0,
  cloneDefinition: vi.fn(),
  migrateCanvas: vi.fn(),
  unsupportedTypes: vi.fn(),
  generateSlug: vi.fn((name: string) =>
    name.toLowerCase().replace(/\s+/g, '-'),
  ),
  appendSlugSuffix: vi.fn((slug: string) => `${slug}-copy`),
}));

vi.mock('uuid', () => ({
  v7: () => `00000000-0000-7000-8000-${String(++mocks.uuid).padStart(12, '0')}`,
}));
vi.mock('../workflow-definition/utils/clone-template.utils', () => ({
  cloneDefinitionWithNewIds: mocks.cloneDefinition,
}));
vi.mock('../agent-definition/agent-input-node-migration.util', () => ({
  migrateAgentCanvasGraph: mocks.migrateCanvas,
  collectUnsupportedAgentCanvasNodeTypes: mocks.unsupportedTypes,
}));
vi.mock('../organization/slug.utils', () => ({
  generateSlug: mocks.generateSlug,
  appendSlugSuffix: mocks.appendSlugSuffix,
}));

type AnyRecord = Record<string, any>;
const TOKEN = 'agent-share-token';
const SOURCE_TENANT = 'source-tenant';
const TARGET_TENANT = 'target-tenant';
const USER_ID = 'target-user';
const ORGANIZATION_ID = 'target-organization';
const SHARE_ID = 'share-id';
const AGENT_ID = 'source-agent';
const VERSION_ID = 'source-version';

function selectChain(result: any[]) {
  const chain: AnyRecord = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn().mockResolvedValue(result);
  return chain;
}
function insertChain(result: any[] = []) {
  const chain: AnyRecord = {};
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn().mockResolvedValue(result);
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve().then(resolve);
  return chain;
}
function updateChain(result: any[] = []) {
  const chain: AnyRecord = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn().mockResolvedValue(result);
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve().then(resolve);
  return chain;
}
function createDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  };
}
function createService(db = createDb()) {
  const storage = {
    buildStorageKey: vi.fn(),
    download: vi.fn(),
    upload: vi.fn(),
  };
  const documents = { rebuildKnowledgeBase: vi.fn() };
  const skills = { getSkillFileMap: vi.fn() };
  const skillStorage = { uploadSkillFile: vi.fn() };
  const sources = { recordImportedResources: vi.fn() };
  const service = new AgentShareImportService(
    db as never,
    storage as never,
    documents as never,
    skills as never,
    skillStorage as never,
    sources as never,
  );
  return { service, db, storage, documents, skills, skillStorage, sources };
}
function share(overrides: AnyRecord = {}) {
  return {
    shareId: SHARE_ID,
    shareToken: TOKEN,
    shareType: 'copyable',
    expiresAt: null,
    isRevoked: false,
    sourceTenantId: SOURCE_TENANT,
    agentDefinitionId: AGENT_ID,
    agentName: 'Shared Agent',
    agentDescription: null,
    agentIcon: null,
    runtimeMode: 'standard',
    publishedVersionId: VERSION_ID,
    ...overrides,
  };
}
function source(overrides: AnyRecord = {}) {
  return {
    agentDefinitionId: AGENT_ID,
    sourceTenantId: SOURCE_TENANT,
    sourceVersionId: VERSION_ID,
    name: 'Shared Agent',
    description: 'description',
    icon: 'bot',
    runtimeMode: 'standard',
    snapshot: {
      runtimeMode: 'standard',
      nodes: [],
      edges: [],
      viewport: { x: 1, y: 2, zoom: 0.8 },
      systemPrompt: 'system',
      metadata: {},
    },
    ...overrides,
  };
}
function context(overrides: AnyRecord = {}) {
  return {
    targetTenantId: TARGET_TENANT,
    targetUserId: USER_ID,
    targetOrganizationId: ORGANIZATION_ID,
    sourceShareId: SHARE_ID,
    sourceShareToken: TOKEN,
    clonedAgents: new Map(),
    clonedKnowledgeBases: new Map(),
    clonedMemoryInstances: new Map(),
    clonedMcpConfigs: new Map(),
    clonedSkills: new Map(),
    rebuildingKnowledgeBaseIds: new Set(),
    reports: [],
    reportKeys: new Set(),
    sourceRecords: [],
    activeAgentCloneStack: new Set(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uuid = 0;
  mocks.cloneDefinition.mockImplementation((value: AnyRecord) =>
    structuredClone(value),
  );
  mocks.migrateCanvas.mockImplementation((value: AnyRecord) => value);
  mocks.unsupportedTypes.mockReturnValue([]);
});

describe('AgentShareImportService access and receipts', () => {
  it.each([
    [[], ShareNotFoundException],
    [[share({ isRevoked: true })], ShareRevokedException],
    [[share({ expiresAt: new Date(0) })], ShareExpiredException],
  ])(
    'rejects inaccessible source shares before cloning',
    async (rows, ErrorType) => {
      const { service, db, sources } = createService();
      db.select.mockReturnValueOnce(selectChain(rows));
      await expect(
        service.importFromShare(TOKEN, TARGET_TENANT, USER_ID),
      ).rejects.toBeInstanceOf(ErrorType);
      expect(sources.recordImportedResources).not.toHaveBeenCalled();
    },
  );

  it('rejects read-only and unpublished agent shares with distinct conflicts', async () => {
    const { service } = createService();
    const getShare = vi.spyOn(service as any, 'getAccessibleShareOrThrow');
    getShare.mockResolvedValueOnce(share({ shareType: 'read_only' }));
    await expect(
      service.importFromShare(TOKEN, TARGET_TENANT, USER_ID),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      type: 'https://agentloom.dev/errors/share-copy-not-allowed',
    });
    getShare.mockResolvedValueOnce(share({ publishedVersionId: null }));
    await expect(
      service.importFromShare(TOKEN, TARGET_TENANT, USER_ID),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      type: 'https://agentloom.dev/errors/share-agent-not-published',
    });
  });

  it('distinguishes missing definitions, versions and target organizations', async () => {
    const { service, db } = createService();
    db.select.mockReturnValueOnce(selectChain([]));
    await expect(
      (service as any).loadSourceAgentSnapshot({
        agentDefinitionId: AGENT_ID,
        sourceTenantId: SOURCE_TENANT,
      }),
    ).rejects.toBeInstanceOf(ShareNotFoundException);

    db.select.mockReturnValueOnce(
      selectChain([share({ publishedVersionId: null })]),
    );
    await expect(
      (service as any).loadSourceAgentSnapshot({
        agentDefinitionId: AGENT_ID,
        sourceTenantId: SOURCE_TENANT,
      }),
    ).rejects.toMatchObject({
      type: 'https://agentloom.dev/errors/share-agent-not-published',
    });

    db.select
      .mockReturnValueOnce(selectChain([share()]))
      .mockReturnValueOnce(selectChain([]));
    await expect(
      (service as any).loadSourceAgentSnapshot({
        agentDefinitionId: AGENT_ID,
        sourceTenantId: SOURCE_TENANT,
        sourceVersionId: VERSION_ID,
      }),
    ).rejects.toBeInstanceOf(ShareNotFoundException);

    db.select.mockReturnValueOnce(selectChain([]));
    await expect(
      (service as any).resolveTargetOrganizationId(TARGET_TENANT),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      type: 'https://agentloom.dev/errors/organization-not-found',
    });
  });

  it('records provenance, rebuilds knowledge, increments copy count and summarizes every outcome', async () => {
    const { service, db, documents, sources } = createService();
    vi.spyOn(service as any, 'getAccessibleShareOrThrow').mockResolvedValue(
      share(),
    );
    vi.spyOn(service as any, 'loadSourceAgentSnapshot').mockResolvedValue(
      source(),
    );
    vi.spyOn(service as any, 'resolveTargetOrganizationId').mockResolvedValue(
      ORGANIZATION_ID,
    );
    vi.spyOn(service as any, 'cloneAgentFromSourceSnapshot').mockImplementation(
      async (...args: unknown[]) => {
        const ctx = args[1] as AnyRecord;
        ctx.sourceRecords.push({
          resourceType: 'agent_definition',
          resourceId: 'new-agent',
        });
        ctx.rebuildingKnowledgeBaseIds.add('new-kb');
        ctx.reports.push(
          { outcome: 'cloned' },
          { outcome: 'cloned' },
          { outcome: 'cleared' },
          { outcome: 'needs_rebind' },
          { outcome: 'skipped_ephemeral' },
        );
        return {
          agentDefinitionId: 'new-agent',
          publishedVersionId: 'new-version',
          name: 'Shared Agent',
        };
      },
    );
    const update = updateChain();
    db.update.mockReturnValue(update);

    const receipt = await service.importFromShare(
      TOKEN,
      TARGET_TENANT,
      USER_ID,
    );
    expect(sources.recordImportedResources).toHaveBeenCalledWith(
      TARGET_TENANT,
      USER_ID,
      [{ resourceType: 'agent_definition', resourceId: 'new-agent' }],
    );
    expect(documents.rebuildKnowledgeBase).toHaveBeenCalledWith(
      'new-kb',
      TARGET_TENANT,
    );
    expect(update.set).toHaveBeenCalledWith({
      copyCount: expect.anything(),
      updatedAt: expect.any(Date),
    });
    expect(receipt).toMatchObject({
      agentDefinitionId: 'new-agent',
      publishedVersionId: 'new-version',
      name: 'Shared Agent',
      summary: { cloned: 2, cleared: 1, needsRebind: 1, skippedEphemeral: 1 },
    });
  });

  it('does not persist provenance or counters when root cloning fails', async () => {
    const { service, db, sources } = createService();
    vi.spyOn(service as any, 'getAccessibleShareOrThrow').mockResolvedValue(
      share(),
    );
    vi.spyOn(service as any, 'loadSourceAgentSnapshot').mockResolvedValue(
      source(),
    );
    vi.spyOn(service as any, 'resolveTargetOrganizationId').mockResolvedValue(
      ORGANIZATION_ID,
    );
    vi.spyOn(service as any, 'cloneAgentFromSourceSnapshot').mockResolvedValue(
      null,
    );
    await expect(
      service.importFromShare(TOKEN, TARGET_TENANT, USER_ID),
    ).rejects.toMatchObject({
      type: 'https://agentloom.dev/errors/agent-share-import-failed',
    });
    expect(sources.recordImportedResources).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('AgentShareImportService snapshot remapping', () => {
  it('remaps cloneable resources and clears tenant-bound workspace/model references', async () => {
    const { service } = createService();
    const ctx = context();
    vi.spyOn(service as any, 'cloneKnowledgeBase').mockResolvedValue('new-kb');
    vi.spyOn(service as any, 'cloneMemoryInstance').mockResolvedValue(
      'new-memory',
    );
    vi.spyOn(service as any, 'cloneMcpServerConfig').mockResolvedValue({
      configId: 'new-mcp',
      toolIdMap: new Map([['old-tool', 'new-tool']]),
    });
    vi.spyOn(service as any, 'cloneSkill').mockResolvedValue('new-skill');
    vi.spyOn(service as any, 'loadSourceAgentSnapshot').mockResolvedValue(
      source({ agentDefinitionId: 'child' }),
    );
    vi.spyOn(service as any, 'insertImportedAgentDefinition')
      .mockResolvedValueOnce({
        agentDefinitionId: 'new-child',
        publishedVersionId: 'new-child-v',
        name: 'Child 副本',
      })
      .mockResolvedValueOnce({
        agentDefinitionId: 'new-root',
        publishedVersionId: 'new-root-v',
        name: 'Shared Agent',
      });
    const nodes = [
      {
        id: 'kb',
        type: 'knowledge-base',
        data: { config: { knowledge_base_id: 'old-kb' } },
      },
      {
        id: 'memory',
        data: { nodeType: 'memory', memory_instance_id: 'old-memory' },
      },
      {
        id: 'mcp',
        type: 'mcp-tool',
        data: {
          mcp_server_config_id: 'old-mcp',
          mcp_tool_definition_id: 'old-tool',
        },
      },
      {
        id: 'sub',
        type: 'sub-agent',
        data: { agent_definition_id: 'child', agent_version_id: 'child-v' },
      },
      {
        id: 'workspace',
        type: 'workspace',
        data: { workspace_id: 'old-workspace' },
      },
      {
        id: 'sandbox',
        type: 'sandbox',
        data: { restore_workspace_id: 'old-restore' },
      },
      {
        id: 'model',
        type: 'llm-model',
        data: { model_config_id: 'old-model' },
      },
      { id: 'skill', type: 'skill', data: { skill_id: 'old-skill' } },
      { id: 'noop', type: 'text', data: null },
    ];
    mocks.cloneDefinition.mockReturnValue({
      nodes: structuredClone(nodes),
      edges: [],
      viewport: null,
    });

    await (service as any).cloneAgentFromSourceSnapshot(
      source({
        snapshot: {
          ...source().snapshot,
          nodes,
          viewport: null,
          workspaceSnapshotId: 'workspace-snapshot',
        },
      }),
      ctx,
      { useShareTitle: true },
    );

    const inserted = (service as any).insertImportedAgentDefinition.mock
      .calls[1][0];
    expect(inserted.nodes[0].data).toMatchObject({ knowledgeBaseId: 'new-kb' });
    expect(inserted.nodes[1].data).toMatchObject({
      memoryInstanceId: 'new-memory',
    });
    expect(inserted.nodes[2].data).toMatchObject({
      mcpServerConfigId: 'new-mcp',
    });
    expect(inserted.nodes[2].data).not.toHaveProperty('mcpToolDefinitionId');
    expect(inserted.nodes[3].data).toMatchObject({
      agentDefinitionId: 'new-child',
      agentVersionId: 'new-child-v',
    });
    expect(inserted.nodes[4].data).not.toHaveProperty('workspace_id');
    expect(inserted.nodes[5].data).not.toHaveProperty('restore_workspace_id');
    expect(inserted.nodes[6].data).not.toHaveProperty('model_config_id');
    expect(inserted.nodes[7].data).toMatchObject({ skillId: 'new-skill' });
    expect(inserted.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(ctx.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: 'workspace',
          outcome: 'cleared',
        }),
        expect.objectContaining({
          resourceType: 'agent_definition',
          outcome: 'needs_rebind',
        }),
        expect.objectContaining({
          sourceResourceId: AGENT_ID,
          outcome: 'cloned',
        }),
      ]),
    );
    expect(ctx.sourceRecords).toContainEqual(
      expect.objectContaining({
        resourceType: 'agent_definition',
        resourceId: 'new-root',
        sourceShareId: SHARE_ID,
        sourceShareToken: TOKEN,
      }),
    );
  });

  it('clears failed clones and unknown MCP tool bindings, deduplicating repeated reports', async () => {
    const { service } = createService();
    const ctx = context();
    vi.spyOn(service as any, 'cloneKnowledgeBase').mockResolvedValue(null);
    vi.spyOn(service as any, 'cloneMemoryInstance').mockResolvedValue(null);
    vi.spyOn(service as any, 'cloneMcpServerConfig').mockResolvedValue({
      configId: 'new-mcp',
      toolIdMap: new Map(),
    });
    vi.spyOn(service as any, 'cloneSkill').mockResolvedValue(null);
    vi.spyOn(service as any, 'insertImportedAgentDefinition').mockResolvedValue(
      {
        agentDefinitionId: 'new-agent',
        publishedVersionId: 'new-version',
        name: 'Shared Agent',
      },
    );
    const nodes = [
      { id: 'kb', type: 'knowledge-base', data: { knowledgeBaseId: 'old-kb' } },
      {
        id: 'memory',
        type: 'memory',
        data: { memoryInstanceId: 'old-memory' },
      },
      {
        id: 'mcp1',
        type: 'mcp-tool',
        data: {
          mcpServerConfigId: 'old-mcp',
          mcpToolDefinitionId: 'missing-tool',
        },
      },
      {
        id: 'mcp2',
        type: 'mcp-tool',
        data: {
          mcpServerConfigId: 'old-mcp',
          mcpToolDefinitionId: 'missing-tool',
        },
      },
      { id: 'skill', type: 'skill', data: { skillId: 'old-skill' } },
    ];
    mocks.cloneDefinition.mockReturnValue({
      nodes: structuredClone(nodes),
      edges: [],
      viewport: null,
    });
    await (service as any).cloneAgentFromSourceSnapshot(
      source({ snapshot: { ...source().snapshot, nodes } }),
      ctx,
    );
    const inserted = (service as any).insertImportedAgentDefinition.mock
      .calls[0][0];
    expect(inserted.nodes[0].data).not.toHaveProperty('knowledgeBaseId');
    expect(inserted.nodes[1].data).not.toHaveProperty('memoryInstanceId');
    expect(inserted.nodes[2].data).not.toHaveProperty('mcpToolDefinitionId');
    expect(inserted.nodes[4].data).not.toHaveProperty('skillId');
    expect(
      ctx.reports.filter((item: AnyRecord) =>
        item.message.includes('MCP 工具绑定'),
      ),
    ).toHaveLength(1);
  });

  it('breaks sub-agent cycles and clears the active stack even for invalid snapshots', async () => {
    const { service } = createService();
    const ctx = context({ activeAgentCloneStack: new Set([AGENT_ID]) });
    await expect(
      (service as any).cloneAgentFromSourceSnapshot(source(), ctx),
    ).resolves.toBeNull();
    expect(ctx.reports).toContainEqual(
      expect.objectContaining({
        outcome: 'needs_rebind',
        sourceResourceId: AGENT_ID,
      }),
    );
    ctx.activeAgentCloneStack.clear();
    mocks.cloneDefinition.mockImplementation(() => {
      throw new Error('invalid snapshot');
    });
    await expect(
      (service as any).cloneAgentFromSourceSnapshot(source(), ctx),
    ).rejects.toThrow('invalid snapshot');
    expect(ctx.activeAgentCloneStack.has(AGENT_ID)).toBe(false);
  });

  it('removes sandbox restore IDs while preserving public input/lifecycle metadata', async () => {
    const { service } = createService();
    const ctx = context();
    vi.spyOn(service as any, 'insertImportedAgentDefinition').mockResolvedValue(
      {
        agentDefinitionId: 'new-agent',
        publishedVersionId: 'new-version',
        name: 'Shared Agent',
      },
    );
    mocks.cloneDefinition.mockReturnValue({
      nodes: [],
      edges: [],
      viewport: null,
    });
    await (service as any).cloneAgentFromSourceSnapshot(
      source({
        runtimeMode: 'sandbox',
        snapshot: {
          ...source().snapshot,
          sandboxConfig: {
            lifecycle: 'persistent',
            restoreWorkspaceId: 'secret-workspace',
          },
          metadata: {
            inputSchema: { type: 'object' },
            sandboxLifecycle: 'persistent',
          },
        },
      }),
      ctx,
    );
    const inserted = (service as any).insertImportedAgentDefinition.mock
      .calls[0][0];
    expect(inserted.sandboxConfig).not.toHaveProperty('restoreWorkspaceId');
    expect(inserted.metadata).toMatchObject({
      inputSchema: { type: 'object' },
      sandboxLifecycle: 'persistent',
      importedFromShare: expect.objectContaining({
        sourceAgentDefinitionId: AGENT_ID,
      }),
    });
  });
});

describe('AgentShareImportService validation and transactions', () => {
  const input = {
    name: 'Imported',
    description: null,
    icon: null,
    runtimeMode: 'standard',
    nodes: [],
    edges: [],
    viewport: null,
    systemPrompt: null,
    sandboxConfig: null,
    workspaceSnapshotId: null,
    metadata: {},
  };

  it('rejects unsupported migrated nodes before opening a transaction', async () => {
    const { service, db } = createService();
    mocks.unsupportedTypes.mockReturnValue([
      { nodeId: 'missing-type', nodeType: '' },
      { nodeId: 'duplicate-node', nodeType: 'illegal-node' },
    ]);
    await expect(
      (service as any).insertImportedAgentDefinition(input, context()),
    ).rejects.toBeInstanceOf(AgentCanvasUnknownNodeTypeException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('atomically writes migrated definition/version metadata and publishes the version', async () => {
    const { service, db } = createService();
    const definitionInsert = insertChain([
      { id: 'new-agent', name: 'Imported' },
    ]);
    const versionInsert = insertChain([{ id: 'new-version' }]);
    const publish = updateChain();
    const tx = {
      insert: vi
        .fn()
        .mockReturnValueOnce(definitionInsert)
        .mockReturnValueOnce(versionInsert),
      update: vi.fn().mockReturnValue(publish),
    };
    db.transaction.mockImplementation(
      async (callback: (tx: AnyRecord) => unknown) => callback(tx),
    );
    mocks.migrateCanvas.mockReturnValue({
      nodes: [{ id: 'migrated', type: 'input', data: {} }],
      edges: [{ id: 'edge', source: 'migrated', target: 'migrated' }],
      systemPrompt: 'migrated prompt',
    });
    const result = await (service as any).insertImportedAgentDefinition(
      {
        ...input,
        runtimeMode: 'sandbox',
        sandboxConfig: { lifecycle: 'session' },
        metadata: {
          inputSchema: { type: 'string' },
          memoryInstanceIds: ['memory-1'],
          sandboxLifecycle: 'session',
        },
      },
      context(),
    );
    expect(result).toEqual({
      agentDefinitionId: 'new-agent',
      publishedVersionId: 'new-version',
      name: 'Imported',
    });
    expect(definitionInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [{ id: 'migrated', type: 'input', data: {} }],
        systemPrompt: 'migrated prompt',
        status: 'draft',
      }),
    );
    expect(versionInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          metadata: expect.objectContaining({
            nodeCount: 1,
            edgeCount: 1,
            inputSchema: { type: 'string' },
            memoryInstanceIds: ['memory-1'],
            sandboxLifecycle: 'session',
          }),
        }),
      }),
    );
    expect(publish.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        publishedVersionId: 'new-version',
        updatedBy: USER_ID,
      }),
    );
  });

  it('retries unique slug conflicts but propagates other and final transaction failures', async () => {
    const { service, db } = createService();
    const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
    db.transaction.mockRejectedValueOnce(duplicate).mockResolvedValueOnce({
      agentDefinitionId: 'new-agent',
      publishedVersionId: 'v',
      name: 'Imported',
    });
    await expect(
      (service as any).insertImportedAgentDefinition(input, context()),
    ).resolves.toMatchObject({ agentDefinitionId: 'new-agent' });
    expect(mocks.appendSlugSuffix).toHaveBeenCalledWith('imported');

    db.transaction
      .mockReset()
      .mockRejectedValue(new Error('database unavailable'));
    await expect(
      (service as any).insertImportedAgentDefinition(input, context()),
    ).rejects.toThrow('database unavailable');
    expect(db.transaction).toHaveBeenCalledTimes(1);

    db.transaction.mockReset().mockRejectedValue(duplicate);
    await expect(
      (service as any).insertImportedAgentDefinition(input, context()),
    ).rejects.toBe(duplicate);
    expect(db.transaction).toHaveBeenCalledTimes(4);
  });
});

describe('AgentShareImportService referenced resources', () => {
  it('clones knowledge documents, strips private bindings and records rebuild provenance', async () => {
    const { service, db, storage } = createService();
    const kb = {
      id: 'old-kb',
      name: 'Knowledge',
      description: null,
      visibility: 'private',
      chunkingStrategy: {},
      retrievalStrategy: {},
      embeddingModel: 'text',
      embeddingModelConfigId: 'private-embedding',
      rerankingStrategy: { type: 'cohere', apiKeyId: 'private-key' },
      queryOrchestration: { type: 'hyde', modelConfigId: 'private-model' },
    };
    const document = {
      id: 'old-doc',
      fileName: 'guide.pdf',
      storageKey: 'old/key',
      sizeBytes: 12,
      mimeType: 'application/pdf',
    };
    db.select
      .mockReturnValueOnce(selectChain([kb]))
      .mockReturnValueOnce(selectChain([document]));
    const kbInsert = insertChain([{ id: 'new-kb', name: 'Knowledge' }]);
    const docInsert = insertChain();
    db.insert.mockReturnValueOnce(kbInsert).mockReturnValueOnce(docInsert);
    storage.buildStorageKey.mockReturnValue('new/key');
    storage.download.mockResolvedValue('stream');
    const ctx = context();
    await expect(
      (service as any).cloneKnowledgeBase(SOURCE_TENANT, 'old-kb', ctx),
    ).resolves.toBe('new-kb');
    expect(kbInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingModelConfigId: null,
        rerankingStrategy: expect.objectContaining({ apiKeyId: null }),
        queryOrchestration: expect.objectContaining({ modelConfigId: null }),
      }),
    );
    expect(storage.upload).toHaveBeenCalledWith(
      'new/key',
      'stream',
      12,
      'application/pdf',
    );
    expect(docInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeBaseId: 'new-kb',
        storageKey: 'new/key',
        status: 'uploaded',
        errorMessage: null,
      }),
    );
    expect(ctx.rebuildingKnowledgeBaseIds.has('new-kb')).toBe(true);
    expect(ctx.sourceRecords).toContainEqual(
      expect.objectContaining({
        resourceType: 'knowledge_base',
        sourceResourceId: 'old-kb',
      }),
    );
    expect(ctx.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'cloned' }),
        expect.objectContaining({ outcome: 'needs_rebind' }),
      ]),
    );
  });

  it('caches missing resources as needs-rebind outcomes', async () => {
    const { service, db } = createService();
    const ctx = context();
    db.select.mockReturnValue(selectChain([]));
    await expect(
      (service as any).cloneKnowledgeBase(SOURCE_TENANT, 'missing-kb', ctx),
    ).resolves.toBeNull();
    await expect(
      (service as any).cloneKnowledgeBase(SOURCE_TENANT, 'missing-kb', ctx),
    ).resolves.toBeNull();
    expect(db.select).toHaveBeenCalledTimes(1);
    db.select.mockClear().mockReturnValue(selectChain([]));
    await expect(
      (service as any).cloneMemoryInstance(
        SOURCE_TENANT,
        'missing-memory',
        ctx,
      ),
    ).resolves.toBeNull();
    await expect(
      (service as any).cloneMcpServerConfig(SOURCE_TENANT, 'missing-mcp', ctx),
    ).resolves.toBeNull();
    expect(ctx.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: 'knowledge_base',
          outcome: 'needs_rebind',
        }),
        expect.objectContaining({
          resourceType: 'memory_instance',
          outcome: 'needs_rebind',
        }),
        expect.objectContaining({
          resourceType: 'mcp_server_config',
          outcome: 'needs_rebind',
        }),
      ]),
    );
  });

  it('remaps memory node, edge, path, version and glossary IDs', async () => {
    const { service, db } = createService();
    const rows = [
      [
        {
          id: 'old-memory',
          name: 'Memory',
          description: null,
          config: {},
          systemPromptOverride: null,
          validDomains: [],
          coreMemoryUris: [],
          status: 'active',
        },
      ],
      [
        { id: 'node-a', contentType: 'text', metadata: {}, disclosureLevel: 1 },
        { id: 'node-b', contentType: 'text', metadata: {}, disclosureLevel: 2 },
      ],
      [
        {
          id: 'edge-a',
          parentNodeId: 'node-a',
          childNodeId: 'node-b',
          name: 'rel',
          priority: 1,
          disclosure: 1,
        },
      ],
      [
        {
          domain: 'd',
          pathString: '/linked',
          edgeId: 'edge-a',
          nodeId: 'node-b',
        },
        { domain: 'd', pathString: '/root', edgeId: null, nodeId: 'node-a' },
      ],
      [
        {
          id: 'ver-a',
          nodeId: 'node-a',
          content: 'a',
          version: 1,
          deprecated: true,
          migratedTo: 'ver-b',
          reviewStatus: 'approved',
          patchSummary: null,
        },
        {
          id: 'ver-b',
          nodeId: 'node-b',
          content: 'b',
          version: 2,
          deprecated: false,
          migratedTo: null,
          reviewStatus: 'approved',
          patchSummary: null,
        },
      ],
      [{ keyword: 'term', nodeId: 'node-a' }],
    ];
    rows.forEach((value) => db.select.mockReturnValueOnce(selectChain(value)));
    const inserts = [
      insertChain([{ id: 'new-memory', name: 'Memory' }]),
      insertChain(),
      insertChain(),
      insertChain(),
      insertChain(),
      insertChain(),
    ];
    inserts.forEach((value) => db.insert.mockReturnValueOnce(value));
    const ctx = context();
    await expect(
      (service as any).cloneMemoryInstance(SOURCE_TENANT, 'old-memory', ctx),
    ).resolves.toBe('new-memory');
    expect(inserts[1].values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.not.stringMatching(/^node-/),
          instanceId: 'new-memory',
        }),
      ]),
    );
    expect(inserts[2].values).toHaveBeenCalledWith([
      expect.objectContaining({
        parentNodeId: expect.not.stringMatching(/^node-/),
        childNodeId: expect.not.stringMatching(/^node-/),
      }),
    ]);
    expect(inserts[3].values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ edgeId: null }),
        expect.objectContaining({ edgeId: expect.any(String) }),
      ]),
    );
    expect(inserts[4].values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ migratedTo: expect.any(String) }),
        expect.objectContaining({ migratedTo: null }),
      ]),
    );
    expect(inserts[5].values).toHaveBeenCalledWith([
      expect.objectContaining({ keyword: 'term' }),
    ]);
  });

  it('clones MCP tools by position and records their source', async () => {
    const { service, db } = createService();
    const config = {
      id: 'old-mcp',
      name: 'Server',
      description: null,
      transportType: 'stdio',
      command: 'cmd',
      args: [],
      url: null,
      encryptedData: 'cipher',
      encryptedDek: 'dek',
      iv: 'iv',
      authTag: 'tag',
      status: 'active',
      lastTestedAt: null,
    };
    const tools = [
      {
        id: 'tool-a',
        source: 'mcp',
        name: 'search',
        title: 'Search',
        description: null,
        inputSchema: {},
        outputSchema: {},
        portMappingMetadata: {},
        annotations: {},
        isActive: true,
        importedAt: null,
      },
      {
        id: 'tool-b',
        source: 'mcp',
        name: 'read',
        title: 'Read',
        description: null,
        inputSchema: {},
        outputSchema: {},
        portMappingMetadata: {},
        annotations: {},
        isActive: true,
        importedAt: new Date(0),
      },
    ];
    db.select
      .mockReturnValueOnce(selectChain([config]))
      .mockReturnValueOnce(selectChain(tools));
    const configInsert = insertChain([{ id: 'new-mcp', name: 'Server' }]);
    const toolInsert = insertChain([
      { id: 'new-tool-a', name: 'search' },
      { id: 'new-tool-b', name: 'read' },
    ]);
    db.insert.mockReturnValueOnce(configInsert).mockReturnValueOnce(toolInsert);
    const ctx = context();
    const cloned = await (service as any).cloneMcpServerConfig(
      SOURCE_TENANT,
      'old-mcp',
      ctx,
    );
    expect(configInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        connectionFingerprint: null,
      }),
    );
    expect(cloned.toolIdMap).toEqual(
      new Map([
        ['tool-a', 'new-tool-a'],
        ['tool-b', 'new-tool-b'],
      ]),
    );
    expect(ctx.sourceRecords).toContainEqual(
      expect.objectContaining({
        resourceType: 'mcp_server_config',
        sourceResourceId: 'old-mcp',
      }),
    );
  });

  it('clones cross-tenant skill files, retries duplicate slugs and caches the result', async () => {
    const { service, db, skills, skillStorage } = createService();
    const skill = {
      id: 'old-skill',
      tenantId: SOURCE_TENANT,
      name: 'Useful Skill',
      slug: 'useful',
      description: null,
      content: 'fallback',
      frontmatter: {},
      isBuiltin: false,
      status: 'active',
      fileCount: 1,
      totalSizeBytes: 8,
    };
    db.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([skill]));
    skills.getSkillFileMap.mockResolvedValue({
      'SKILL.md': '# Skill',
      'guide.md': 'Guide',
    });
    const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
    const txInsert = insertChain([
      { id: 'new-skill', name: 'Useful Skill 副本' },
    ]);
    db.transaction
      .mockRejectedValueOnce(duplicate)
      .mockImplementationOnce(async (callback: (tx: AnyRecord) => unknown) =>
        callback({ insert: vi.fn().mockReturnValue(txInsert) }),
      );
    const ctx = context();
    await expect((service as any).cloneSkill('old-skill', ctx)).resolves.toBe(
      'new-skill',
    );
    expect(txInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'useful-skill-copy',
        name: 'Useful Skill 副本',
        content: '# Skill',
        fileCount: 2,
      }),
    );
    expect(skillStorage.uploadSkillFile).toHaveBeenCalledTimes(2);
    expect(ctx.sourceRecords).toContainEqual(
      expect.objectContaining({
        resourceType: 'skill',
        sourceResourceId: 'old-skill',
      }),
    );
    await expect((service as any).cloneSkill('old-skill', ctx)).resolves.toBe(
      'new-skill',
    );
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('reports missing skills without exposing a partial binding', async () => {
    const { service, db } = createService();
    db.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));
    const ctx = context();
    await expect(
      (service as any).cloneSkill('missing-skill', ctx),
    ).resolves.toBeNull();
    expect(ctx.clonedSkills.get('missing-skill')).toBeNull();
    expect(ctx.reports).toContainEqual(
      expect.objectContaining({
        resourceType: 'skill',
        outcome: 'needs_rebind',
        targetResourceId: null,
      }),
    );
  });
});
