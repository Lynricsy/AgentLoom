import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveSubAgent, MAX_SUB_AGENT_DEPTH } from '../sub-agent.handler';

const { mockAgentDefinitionService } = vi.hoisted(() => ({
  mockAgentDefinitionService: {
    findDetailById: vi.fn(),
    listVersions: vi.fn(),
  },
}));

const agentDefinitionFixture = {
  id: 'agent-def-1',
  tenantId: 'tenant-1',
  name: 'Test Agent',
  slug: 'test-agent',
  description: null,
  status: 'published' as const,
  version: 1,
  publishedVersionId: 'version-1',
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  systemPrompt: null,
  nodes: [],
  edges: [],
  viewport: null,
  sandboxConfig: null,
  workspaceSnapshotId: null,
};

const agentVersionFixture = {
  id: 'version-1',
  agentDefinitionId: 'agent-def-1',
  versionNumber: 1,
  label: 'v1.0',
  snapshot: {
    nodes: [],
    edges: [],
    viewport: null,
    metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
  },
  publishedAt: '2024-01-01T00:00:00.000Z',
  archivedAt: null,
  createdBy: 'user-1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('resolveSubAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentDefinitionService.findDetailById.mockResolvedValue(
      agentDefinitionFixture,
    );
    mockAgentDefinitionService.listVersions.mockResolvedValue({
      data: [agentVersionFixture],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
  });

  it('resolves a published agent with its default published version', async () => {
    const result = await resolveSubAgent({
      agentDefinitionId: 'agent-def-1',
      tenantId: 'tenant-1',
      currentDepth: 0,
      maxDepth: MAX_SUB_AGENT_DEPTH,
      visitedIds: new Set(),
      agentDefinitionService: mockAgentDefinitionService as never,
    });

    expect(result.agentDefinition.id).toBe('agent-def-1');
    expect(result.versionSnapshot?.id).toBe('version-1');
  });

  it('resolves a specific agentVersionId when provided', async () => {
    const version2 = {
      ...agentVersionFixture,
      id: 'version-2',
      versionNumber: 2,
    };
    mockAgentDefinitionService.listVersions.mockResolvedValue({
      data: [version2],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });

    const result = await resolveSubAgent({
      agentDefinitionId: 'agent-def-1',
      agentVersionId: 'version-2',
      tenantId: 'tenant-1',
      currentDepth: 0,
      maxDepth: MAX_SUB_AGENT_DEPTH,
      visitedIds: new Set(),
      agentDefinitionService: mockAgentDefinitionService as never,
    });

    expect(result.versionSnapshot?.id).toBe('version-2');
  });

  it('returns null versionSnapshot when version row is not found', async () => {
    mockAgentDefinitionService.listVersions.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 },
    });

    const result = await resolveSubAgent({
      agentDefinitionId: 'agent-def-1',
      tenantId: 'tenant-1',
      currentDepth: 0,
      maxDepth: MAX_SUB_AGENT_DEPTH,
      visitedIds: new Set(),
      agentDefinitionService: mockAgentDefinitionService as never,
    });

    expect(result.agentDefinition.id).toBe('agent-def-1');
    expect(result.versionSnapshot).toBeNull();
  });

  it('adds agentDefinitionId to visitedIds after successful resolution', async () => {
    const visitedIds = new Set<string>();

    await resolveSubAgent({
      agentDefinitionId: 'agent-def-1',
      tenantId: 'tenant-1',
      currentDepth: 0,
      maxDepth: MAX_SUB_AGENT_DEPTH,
      visitedIds,
      agentDefinitionService: mockAgentDefinitionService as never,
    });

    expect(visitedIds.has('agent-def-1')).toBe(true);
  });

  it('throws when currentDepth reaches MAX_SUB_AGENT_DEPTH', async () => {
    await expect(
      resolveSubAgent({
        agentDefinitionId: 'agent-def-1',
        tenantId: 'tenant-1',
        currentDepth: MAX_SUB_AGENT_DEPTH,
        maxDepth: MAX_SUB_AGENT_DEPTH,
        visitedIds: new Set(),
        agentDefinitionService: mockAgentDefinitionService as never,
      }),
    ).rejects.toThrow('depth limit exceeded');
  });

  it('throws when currentDepth exceeds MAX_SUB_AGENT_DEPTH', async () => {
    await expect(
      resolveSubAgent({
        agentDefinitionId: 'agent-def-1',
        tenantId: 'tenant-1',
        currentDepth: MAX_SUB_AGENT_DEPTH + 2,
        maxDepth: MAX_SUB_AGENT_DEPTH,
        visitedIds: new Set(),
        agentDefinitionService: mockAgentDefinitionService as never,
      }),
    ).rejects.toThrow(`${MAX_SUB_AGENT_DEPTH}`);
  });

  it('throws on circular reference when agentDefinitionId is already in visitedIds', async () => {
    await expect(
      resolveSubAgent({
        agentDefinitionId: 'agent-def-1',
        tenantId: 'tenant-1',
        currentDepth: 0,
        maxDepth: MAX_SUB_AGENT_DEPTH,
        visitedIds: new Set(['agent-def-1']),
        agentDefinitionService: mockAgentDefinitionService as never,
      }),
    ).rejects.toThrow('Circular');
  });

  it('throws when agent does not exist for tenant', async () => {
    mockAgentDefinitionService.findDetailById.mockRejectedValue(
      new Error('Sub-agent not found'),
    );

    await expect(
      resolveSubAgent({
        agentDefinitionId: 'unknown-agent',
        tenantId: 'tenant-1',
        currentDepth: 0,
        maxDepth: MAX_SUB_AGENT_DEPTH,
        visitedIds: new Set(),
        agentDefinitionService: mockAgentDefinitionService as never,
      }),
    ).rejects.toThrow('not found');
  });

  it('throws when agent has no published version', async () => {
    mockAgentDefinitionService.findDetailById.mockResolvedValue({
      ...agentDefinitionFixture,
      publishedVersionId: null,
    });

    await expect(
      resolveSubAgent({
        agentDefinitionId: 'agent-def-1',
        tenantId: 'tenant-1',
        currentDepth: 0,
        maxDepth: MAX_SUB_AGENT_DEPTH,
        visitedIds: new Set(),
        agentDefinitionService: mockAgentDefinitionService as never,
      }),
    ).rejects.toThrow('no published version');
  });
});
