import { describe, it, expect, vi } from 'vitest';
import {
  resolveSubAgent,
  MAX_SUB_AGENT_DEPTH,
  type SubAgentNodeConfig,
} from '../sub-agent.handler';
import type { DrizzleDB } from '../../../../database/database.module';

const agentDefinitionFixture = {
  id: 'agent-def-1',
  tenantId: 'tenant-1',
  name: 'Test Agent',
  slug: 'test-agent',
  status: 'published' as const,
  publishedVersionId: 'version-1',
  version: 1,
  nodes: [],
  edges: [],
  viewport: null,
  metadata: null,
  systemPrompt: null,
  sandboxConfig: null,
  workspaceSnapshotId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  createdBy: 'user-1',
};

const agentVersionFixture = {
  id: 'version-1',
  agentDefinitionId: 'agent-def-1',
  tenantId: 'tenant-1',
  versionNumber: 1,
  label: 'v1.0',
  snapshot: {
    nodes: [],
    edges: [],
    viewport: null,
    metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
  },
  publishedAt: new Date('2024-01-01'),
  archivedAt: null,
  createdBy: 'user-1',
  createdAt: new Date('2024-01-01'),
};

function buildMockDb(
  agentRows: unknown[],
  versionRows: unknown[],
): DrizzleDB {
  const mockWhere = vi
    .fn()
    .mockResolvedValueOnce(agentRows)
    .mockResolvedValueOnce(versionRows);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  return { select: mockSelect } as unknown as DrizzleDB;
}

describe('resolveSubAgent', () => {
  it('resolves a published agent with its default published version', async () => {
    const config: SubAgentNodeConfig = {
      agentDefinitionId: 'agent-def-1',
    };
    const mockDb = buildMockDb(
      [agentDefinitionFixture],
      [agentVersionFixture],
    );

    const result = await resolveSubAgent(config, mockDb, 'tenant-1');

    expect(result.agentDefinition.id).toBe('agent-def-1');
    expect(result.versionSnapshot?.id).toBe('version-1');
  });

  it('resolves a specific agentVersionId when provided', async () => {
    const version2 = { ...agentVersionFixture, id: 'version-2', versionNumber: 2 };
    const config: SubAgentNodeConfig = {
      agentDefinitionId: 'agent-def-1',
      agentVersionId: 'version-2',
    };
    const mockDb = buildMockDb([agentDefinitionFixture], [version2]);

    const result = await resolveSubAgent(config, mockDb, 'tenant-1');

    expect(result.versionSnapshot?.id).toBe('version-2');
  });

  it('returns null versionSnapshot when version row is not found', async () => {
    const config: SubAgentNodeConfig = { agentDefinitionId: 'agent-def-1' };
    const mockDb = buildMockDb([agentDefinitionFixture], []);

    const result = await resolveSubAgent(config, mockDb, 'tenant-1');

    expect(result.agentDefinition.id).toBe('agent-def-1');
    expect(result.versionSnapshot).toBeNull();
  });

  it('adds agentDefinitionId to visitedIds after successful resolution', async () => {
    const config: SubAgentNodeConfig = { agentDefinitionId: 'agent-def-1' };
    const visitedIds = new Set<string>();
    const mockDb = buildMockDb([agentDefinitionFixture], [agentVersionFixture]);

    await resolveSubAgent(config, mockDb, 'tenant-1', 0, visitedIds);

    expect(visitedIds.has('agent-def-1')).toBe(true);
  });

  it('throws when currentDepth reaches MAX_SUB_AGENT_DEPTH', async () => {
    const config: SubAgentNodeConfig = { agentDefinitionId: 'agent-def-1' };
    const mockDb = buildMockDb([], []);

    await expect(
      resolveSubAgent(config, mockDb, 'tenant-1', MAX_SUB_AGENT_DEPTH),
    ).rejects.toThrow('depth limit exceeded');
  });

  it('throws when currentDepth exceeds MAX_SUB_AGENT_DEPTH', async () => {
    const config: SubAgentNodeConfig = { agentDefinitionId: 'agent-def-1' };
    const mockDb = buildMockDb([], []);

    await expect(
      resolveSubAgent(config, mockDb, 'tenant-1', MAX_SUB_AGENT_DEPTH + 2),
    ).rejects.toThrow(`${MAX_SUB_AGENT_DEPTH}`);
  });

  it('throws on circular reference when agentDefinitionId is already in visitedIds', async () => {
    const config: SubAgentNodeConfig = { agentDefinitionId: 'agent-def-1' };
    const visitedIds = new Set(['agent-def-1']);
    const mockDb = buildMockDb([], []);

    await expect(
      resolveSubAgent(config, mockDb, 'tenant-1', 0, visitedIds),
    ).rejects.toThrow('Circular');
  });

  it('throws when agent does not exist for tenant', async () => {
    const config: SubAgentNodeConfig = { agentDefinitionId: 'unknown-agent' };
    const mockDb = buildMockDb([], []);

    await expect(
      resolveSubAgent(config, mockDb, 'tenant-1'),
    ).rejects.toThrow('not found');
  });

  it('throws when agent has no published version', async () => {
    const unpublished = { ...agentDefinitionFixture, publishedVersionId: null };
    const config: SubAgentNodeConfig = { agentDefinitionId: 'agent-def-1' };
    const mockDb = buildMockDb([unpublished], []);

    await expect(
      resolveSubAgent(config, mockDb, 'tenant-1'),
    ).rejects.toThrow('no published version');
  });
});
