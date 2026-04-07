import { describe, expect, it } from 'vitest';

import {
  migrateAgentCanvasGraph,
  migrateAgentVersionSnapshot,
  migrateWorkflowGraph,
} from './agent-input-node-migration.util';

describe('agent-input-node-migration.util', () => {
  it('将 agent definition 的 legacy systemPrompt 迁移为 text 节点与 system-prompt-in 连线', () => {
    const migrated = migrateAgentCanvasGraph({
      nodes: [
        {
          id: 'main',
          type: 'agent',
          position: { x: 400, y: 240 },
          data: {
            nodeType: 'agent-main',
            category: 'agent',
          },
        },
      ],
      edges: [],
      systemPrompt: '你是一个审查助手',
    });

    expect(migrated.changed).toBe(true);
    expect(migrated.systemPrompt).toBeNull();
    expect(migrated.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'main__system-prompt',
          type: 'output',
          data: expect.objectContaining({
            nodeType: 'text',
            config: { text: '你是一个审查助手' },
          }),
        }),
      ]),
    );
    expect(migrated.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'main__system-prompt',
          target: 'main',
          sourceHandle: 'text-out',
          targetHandle: 'system-prompt-in',
        }),
      ]),
    );
  });

  it('应把 agent snapshot 中 sub-agent 的 legacy text/json handle 迁移到新语义', () => {
    const migrated = migrateAgentVersionSnapshot({
      runtimeMode: 'sandbox',
      nodes: [
        {
          id: 'sub-1',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'sub-agent',
            category: 'agent',
            inputPorts: [{ id: 'text-in' }, { id: 'json-in' }],
            outputPorts: [{ id: 'agent-out' }],
          },
        },
      ],
      edges: [
        {
          id: 'edge-text',
          source: 'node-text',
          target: 'sub-1',
          targetHandle: 'text-in',
        },
        {
          id: 'edge-json',
          source: 'node-json',
          target: 'sub-1',
          targetHandle: 'json',
        },
      ],
      viewport: null,
      systemPrompt: null,
      metadata: {
        nodeCount: 1,
        edgeCount: 2,
        createdFromVersion: 1,
      },
    });

    const inputPortIds = (
      (
        migrated.snapshot.nodes[0]?.data as {
          inputPorts?: Array<{ id?: string }>;
        }
      )?.inputPorts ?? []
    ).map((port) => port.id);

    expect(inputPortIds).toEqual(
      expect.arrayContaining(['system-prompt-in', 'model-in', 'schema-in']),
    );
    expect(migrated.snapshot.edges).toEqual([
      expect.objectContaining({ targetHandle: 'system-prompt-in' }),
      expect.objectContaining({ targetHandle: 'schema-in' }),
    ]);
  });

  it('应把 Agent 画布中的 legacy mcp 节点类型与输出句柄迁移为 mcp-tool', () => {
    const migrated = migrateAgentCanvasGraph({
      nodes: [
        {
          id: 'mcp-1',
          type: 'tool',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'mcp',
            category: 'tool',
            mcpServerId: 'cfg-websearch',
            config: {
              mcpServerId: 'cfg-websearch',
            },
            outputPorts: [{ id: 'tools-out', label: '工具' }],
          },
        },
      ],
      edges: [
        {
          id: 'edge-mcp',
          source: 'mcp-1',
          target: 'agent-main',
          sourceHandle: 'tools-out',
          targetHandle: 'tools-in',
        },
      ],
      systemPrompt: null,
    });

    expect(migrated.changed).toBe(true);
    expect(migrated.nodes[0]).toEqual(
      expect.objectContaining({
        type: 'tool',
        data: expect.objectContaining({
          nodeType: 'mcp-tool',
          category: 'tool',
          mcpServerConfigId: 'cfg-websearch',
          config: expect.objectContaining({
            mcpServerConfigId: 'cfg-websearch',
          }),
          outputPorts: [expect.objectContaining({ id: 'tool-out' })],
        }),
      }),
    );
    expect(migrated.edges).toEqual([
      expect.objectContaining({
        sourceHandle: 'tool-out',
        targetHandle: 'tools-in',
      }),
    ]);
  });

  it('将 workflow agent 节点上的 legacy systemPrompt 字段迁移为 text 节点', () => {
    const migrated = migrateWorkflowGraph({
      nodes: [
        {
          id: 'workflow-agent',
          type: 'agent',
          position: { x: 320, y: 220 },
          data: {
            nodeType: 'agent',
            category: 'agent',
            config: {
              systemPrompt: '请只返回标题和摘要',
            },
            inputPorts: [{ id: 'exec-in' }, { id: 'text-in' }],
            outputPorts: [{ id: 'agent-out' }],
          },
        },
      ],
      edges: [],
    });

    expect(migrated.changed).toBe(true);
    expect(migrated.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'workflow-agent__system-prompt',
          data: expect.objectContaining({
            nodeType: 'text',
            config: { text: '请只返回标题和摘要' },
          }),
        }),
        expect.objectContaining({
          id: 'workflow-agent',
          data: expect.objectContaining({
            inputPorts: expect.arrayContaining([
              expect.objectContaining({ id: 'system-prompt-in' }),
            ]),
          }),
        }),
      ]),
    );
    expect(migrated.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'workflow-agent__system-prompt',
          target: 'workflow-agent',
          targetHandle: 'system-prompt-in',
        }),
      ]),
    );
  });
});
