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
});
