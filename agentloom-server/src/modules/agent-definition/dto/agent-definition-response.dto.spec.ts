import { describe, expect, it } from 'vitest';
import { serializeAgentDefinitionDetail } from './agent-definition-response.dto';

describe('serializeAgentDefinitionDetail', () => {
  it('hydrates canvas metadata fields from agent metadata and sandbox config', () => {
    const createdAt = new Date('2026-03-28T00:00:00.000Z');
    const updatedAt = new Date('2026-03-28T01:00:00.000Z');

    const result = serializeAgentDefinitionDetail({
      id: 'agent-1',
      tenantId: 'tenant-1',
      name: 'Agent',
      slug: 'agent',
      description: null,
      icon: null,
      runtimeMode: 'sandbox',
      status: 'draft',
      version: 3,
      publishedVersionId: null,
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt,
      updatedAt,
      systemPrompt: null,
      nodes: [],
      edges: [],
      viewport: null,
      sandboxConfig: {
        cpu: 1,
        memory: 512,
        disk: 1,
        timeout: 300,
        lifecycleMode: 'persistent',
      },
      workspaceSnapshotId: null,
      metadata: {
        inputSchema: {
          type: 'object',
          properties: {
            question: { type: 'string' },
          },
          required: ['question'],
        },
        memoryInstanceIds: ['memory-1', 'memory-2'],
        sandboxLifecycle: 'persistent',
      },
    });

    expect(result.inputSchema).toEqual({
      type: 'object',
      properties: {
        question: { type: 'string' },
      },
      required: ['question'],
    });
    expect(result.memoryInstanceIds).toEqual(['memory-1', 'memory-2']);
    expect(result.sandboxLifecycle).toBe('persistent');
  });

  it('falls back to sandbox config lifecycle when metadata is absent', () => {
    const createdAt = new Date('2026-03-28T00:00:00.000Z');
    const updatedAt = new Date('2026-03-28T01:00:00.000Z');

    const result = serializeAgentDefinitionDetail({
      id: 'agent-1',
      tenantId: 'tenant-1',
      name: 'Agent',
      slug: 'agent',
      description: null,
      icon: null,
      runtimeMode: 'sandbox',
      status: 'draft',
      version: 3,
      publishedVersionId: null,
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt,
      updatedAt,
      systemPrompt: null,
      nodes: [],
      edges: [],
      viewport: null,
      sandboxConfig: {
        cpu: 1,
        memory: 512,
        disk: 1,
        timeout: 300,
        lifecycleMode: 'session',
      },
      workspaceSnapshotId: null,
      metadata: {},
    });

    expect(result.inputSchema).toBeNull();
    expect(result.memoryInstanceIds).toBeNull();
    expect(result.sandboxLifecycle).toBe('session');
  });

  it('metadata 与 sandboxConfig.lifecycleMode 冲突时应以 sandboxConfig 为准', () => {
    const createdAt = new Date('2026-04-07T00:00:00.000Z');
    const updatedAt = new Date('2026-04-07T01:00:00.000Z');

    const result = serializeAgentDefinitionDetail({
      id: 'agent-1',
      tenantId: 'tenant-1',
      name: 'Agent',
      slug: 'agent',
      description: null,
      icon: null,
      runtimeMode: 'sandbox',
      status: 'published',
      version: 9,
      publishedVersionId: 'version-9',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt,
      updatedAt,
      systemPrompt: null,
      nodes: [],
      edges: [],
      viewport: null,
      sandboxConfig: {
        cpu: 1,
        memory: 512,
        disk: 1,
        timeout: 24,
        lifecycleMode: 'persistent',
      },
      workspaceSnapshotId: null,
      metadata: {
        sandboxLifecycle: 'session',
      },
    });

    expect(result.sandboxLifecycle).toBe('persistent');
  });

  it('应从画布节点恢复旧 sandboxConfig 丢失的 timeoutSeconds', () => {
    const createdAt = new Date('2026-04-03T00:00:00.000Z');
    const updatedAt = new Date('2026-04-03T00:30:00.000Z');

    const result = serializeAgentDefinitionDetail({
      id: 'agent-1',
      tenantId: 'tenant-1',
      name: 'Agent',
      slug: 'agent',
      description: null,
      icon: null,
      runtimeMode: 'sandbox',
      status: 'published',
      version: 25,
      publishedVersionId: 'version-25',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt,
      updatedAt,
      systemPrompt: null,
      nodes: [
        {
          id: 'agent-main',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { nodeType: 'agent-main' },
        },
        {
          id: 'sandbox-1',
          type: 'tool',
          position: { x: 120, y: 0 },
          data: {
            nodeType: 'sandbox',
            cpuLimit: 3,
            memoryLimitMb: 1536,
            diskLimitGb: 6,
            timeoutSeconds: 450,
          },
        },
      ] as never,
      edges: [
        {
          id: 'edge-sandbox-main',
          source: 'sandbox-1',
          target: 'agent-main',
          sourceHandle: 'sandbox-out',
          targetHandle: 'sandbox-in',
        },
      ] as never,
      viewport: null,
      sandboxConfig: {
        cpu: 3,
        memory: 1536,
        disk: 6,
        timeout: 450,
      },
      workspaceSnapshotId: null,
      metadata: {},
    });

    expect(result.sandboxConfig).toEqual({
      cpu: 3,
      memory: 1536,
      disk: 6,
      timeout: 1,
      timeoutSeconds: 450,
      conversationIdleAutoEndMinutes: 10,
    });
    expect(result.sandboxLifecycle).toBeNull();
  });

  it('agent-main 存在但未连接 sandbox 时不应在 detail response 中隐式回退 sandboxConfig', () => {
    const createdAt = new Date('2026-04-03T00:00:00.000Z');
    const updatedAt = new Date('2026-04-03T00:30:00.000Z');

    const result = serializeAgentDefinitionDetail({
      id: 'agent-1',
      tenantId: 'tenant-1',
      name: 'Agent',
      slug: 'agent',
      description: null,
      icon: null,
      runtimeMode: 'sandbox',
      status: 'draft',
      version: 2,
      publishedVersionId: null,
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt,
      updatedAt,
      systemPrompt: null,
      nodes: [
        {
          id: 'agent-main',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'agent-main',
          },
        },
        {
          id: 'sandbox-orphan',
          type: 'tool',
          position: { x: 100, y: 0 },
          data: {
            nodeType: 'sandbox',
            cpuLimit: 2,
            memoryLimitMb: 1024,
            diskLimitGb: 4,
            timeoutSeconds: 600,
          },
        },
      ] as never,
      edges: [] as never,
      viewport: null,
      sandboxConfig: {
        cpu: 2,
        memory: 1024,
        disk: 4,
        timeout: 1,
        timeoutSeconds: 600,
      },
      workspaceSnapshotId: null,
      metadata: {},
    });

    expect(result.sandboxConfig).toBeNull();
    expect(result.sandboxLifecycle).toBeNull();
  });

  it('应在 detail response 中把 legacy mcp 节点别名与输出句柄归一化', () => {
    const createdAt = new Date('2026-04-07T00:00:00.000Z');
    const updatedAt = new Date('2026-04-07T00:30:00.000Z');

    const result = serializeAgentDefinitionDetail({
      id: 'agent-1',
      tenantId: 'tenant-1',
      name: 'Agent',
      slug: 'agent',
      description: null,
      icon: null,
      runtimeMode: 'sandbox',
      status: 'published',
      version: 15,
      publishedVersionId: 'version-15',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt,
      updatedAt,
      systemPrompt: null,
      nodes: [
        {
          id: 'main-agent',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { nodeType: 'agent-main' },
        },
        {
          id: 'mcp-1',
          type: 'tool',
          position: { x: 120, y: 0 },
          data: {
            nodeType: 'mcp',
            category: 'tool',
            outputPorts: [{ id: 'tools-out', label: '工具' }],
          },
        },
      ] as never,
      edges: [
        {
          id: 'edge-mcp',
          source: 'mcp-1',
          target: 'main-agent',
          sourceHandle: 'tools-out',
          targetHandle: 'tools-in',
        },
      ] as never,
      viewport: null,
      sandboxConfig: null,
      workspaceSnapshotId: null,
      metadata: {},
    });

    expect(result.nodes[1]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          nodeType: 'mcp-tool',
          outputPorts: [expect.objectContaining({ id: 'tool-out' })],
        }),
      }),
    );
    expect(result.edges).toEqual([
      expect.objectContaining({
        sourceHandle: 'tool-out',
        targetHandle: 'tools-in',
      }),
    ]);
  });
});
