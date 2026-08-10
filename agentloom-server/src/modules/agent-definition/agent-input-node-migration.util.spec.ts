import { describe, expect, it } from 'vitest';

import {
  collectInvalidAgentCanvasMcpToolNodes,
  collectUnsupportedAgentCanvasNodeTypes,
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
  it('规范画布应保持节点、边和 systemPrompt 不变', () => {
    const input = {
      nodes: [
        {
          id: 'text-1',
          type: 'output',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'text',
            category: 'output',
            config: { text: 'ready' },
            inputPorts: [],
            outputPorts: [{ id: 'text-out' }],
          },
        },
      ],
      edges: [],
      systemPrompt: null,
    };

    const migrated = migrateAgentCanvasGraph(input);

    expect(migrated).toEqual({ ...input, changed: false });
    expect(migrated.nodes).not.toBe(input.nodes);
  });

  it('应规范所有 legacy 输出句柄并保留无关边', () => {
    const migrated = migrateAgentCanvasGraph({
      nodes: [
        {
          id: 'model',
          type: 'llm-model',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'llm-model',
            outputPorts: [{ id: 'model_output' }, { id: 'model-out' }, {}],
          },
        },
        {
          id: 'workspace',
          type: 'workspace',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'workspace',
            outputPorts: [{ id: 'volume-output' }],
          },
        },
        {
          id: 'memory',
          type: 'memory',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'memory',
            outputPorts: [{ id: 'memory_out_0' }],
          },
        },
        {
          id: 'sub',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { nodeType: 'sub-agent' },
        },
        {
          id: 'main',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { nodeType: 'agent-main' },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'model',
          target: 'main',
          sourceHandle: 'model_output',
        },
        {
          id: 'e2',
          source: 'workspace',
          target: 'main',
          sourceHandle: 'volume-output',
        },
        {
          id: 'e3',
          source: 'memory',
          target: 'main',
          sourceHandle: 'memory_out_0',
        },
        {
          id: 'e4',
          source: 'sub',
          target: 'main',
          sourceHandle: 'agent-output',
        },
        {
          id: 'e5',
          source: 'missing',
          target: 'main',
          sourceHandle: 'unchanged',
        },
      ],
      systemPrompt: null,
    });

    expect(migrated.nodes[0]).toMatchObject({
      data: {
        outputPorts: [{ id: 'model-out' }, { id: 'model-out' }, {}],
      },
    });
    expect(migrated.nodes[1]).toMatchObject({
      data: { outputPorts: [{ id: 'volume-out' }] },
    });
    expect(migrated.nodes[2]).toMatchObject({
      data: { outputPorts: [{ id: 'memory-out' }] },
    });
    expect(migrated.edges.map((edge) => edge.sourceHandle)).toEqual([
      'model-out',
      'volume-out',
      'memory-out',
      'agent-out',
      'unchanged',
    ]);
  });

  it('canonical system/schema 边优先于 legacy 重复边', () => {
    const migrated = migrateAgentCanvasGraph({
      nodes: [
        {
          id: 'sub',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { nodeType: 'sub-agent' },
        },
      ],
      edges: [
        {
          id: 'legacy-text',
          source: 'a',
          target: 'sub',
          targetHandle: 'TEXT_IN',
        },
        {
          id: 'canonical-text',
          source: 'b',
          target: 'sub',
          targetHandle: 'system_prompt_in',
        },
        {
          id: 'legacy-json',
          source: 'c',
          target: 'sub',
          targetHandle: 'JSON_IN',
        },
        {
          id: 'canonical-json',
          source: 'd',
          target: 'sub',
          targetHandle: 'schema_in',
        },
        { id: 'other', source: 'e', target: 'sub', targetHandle: 'tools-in' },
      ],
      systemPrompt: null,
    });

    expect(migrated.edges.map((edge) => edge.id)).toEqual([
      'canonical-text',
      'canonical-json',
      'other',
    ]);
    expect(migrated.edges[2]).toMatchObject({ targetHandle: 'tools-in' });
  });

  it('prompt 节点和边 id 冲突时应选择首个可用后缀并使用默认坐标', () => {
    const migrated = migrateAgentCanvasGraph({
      nodes: [
        {
          id: 'main',
          type: 'agent',
          position: undefined as never,
          data: { nodeType: 'agent-main' },
        },
        {
          id: 'main__system-prompt',
          type: 'output',
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'main__system-prompt-2',
          type: 'output',
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      edges: [
        { id: 'main__system-prompt__edge', source: 'x', target: 'y' },
        { id: 'main__system-prompt__edge-2', source: 'x', target: 'y' },
      ],
      systemPrompt: '  persisted prompt  ',
    });

    expect(migrated.nodes).toContainEqual(
      expect.objectContaining({
        id: 'main__system-prompt-3',
        position: { x: 40, y: 320 },
        data: expect.objectContaining({
          config: { text: 'persisted prompt' },
          outputPorts: [
            expect.objectContaining({
              multiple: true,
              maxConnections: null,
              schema: { kind: 'text', title: '文本' },
            }),
          ],
        }),
      }),
    );
    expect(migrated.edges.at(-1)).toMatchObject({
      id: 'main__system-prompt__edge-3',
      source: 'main__system-prompt-3',
      target: 'main',
    });
    expect(migrated.systemPrompt).toBeNull();
  });

  it.each([
    { prompt: '   ', expected: null },
    { prompt: '', expected: null },
    { prompt: undefined, expected: undefined },
    { prompt: null, expected: null },
  ])(
    '无有效 prompt 且无 agent-main 时规范为 $expected',
    ({ prompt, expected }) => {
      const migrated = migrateAgentCanvasGraph({
        nodes: [],
        edges: [],
        systemPrompt: prompt,
      });

      expect(migrated.systemPrompt).toBe(expected);
      expect(migrated.nodes).toEqual([]);
      expect(migrated.edges).toEqual([]);
    },
  );

  it('已有 system prompt 边时清除 legacy 字段但不创建重复节点或边', () => {
    const migrated = migrateAgentCanvasGraph({
      nodes: [
        {
          id: 'main',
          type: 'agent',
          position: { x: 20, y: 30 },
          data: { nodeType: 'agent-main' },
        },
        {
          id: 'prompt',
          type: 'output',
          position: { x: 0, y: 0 },
          data: { nodeType: 'text' },
        },
      ],
      edges: [
        {
          id: 'existing',
          source: 'prompt',
          target: 'main',
          targetHandle: 'SYSTEM_PROMPT_IN',
        },
      ],
      systemPrompt: 'legacy',
    });

    expect(migrated.nodes).toHaveLength(2);
    expect(migrated.edges).toHaveLength(1);
    expect(migrated.systemPrompt).toBeNull();
  });

  it('应从 snake_case MCP 字段迁移并保留非对象 config', () => {
    const migrated = migrateAgentCanvasGraph({
      nodes: [
        {
          id: 'mcp',
          type: 'mcp',
          position: { x: 0, y: 0 },
          data: {
            node_type: 'mcp',
            category: ' ',
            mcp_server_id: ' cfg-1 ',
            config: 'legacy',
            outputPorts: 'not-an-array',
          },
        },
      ],
      edges: [],
      systemPrompt: null,
    });

    expect(migrated.nodes[0]).toMatchObject({
      type: 'tool',
      data: {
        nodeType: 'mcp-tool',
        category: 'tool',
        mcpServerConfigId: 'cfg-1',
        config: 'legacy',
        outputPorts: 'not-an-array',
      },
    });
  });

  it('unsupported collector 应报告缺失 id/type、未知类型并接受 legacy mcp', () => {
    expect(
      collectUnsupportedAgentCanvasNodeTypes([
        { id: '', type: '', position: { x: 0, y: 0 }, data: null },
        {
          id: 'unknown',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { nodeType: 'future-node' },
        },
        {
          id: 'legacy',
          type: 'mcp',
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'snake',
          type: 'ignored',
          position: { x: 0, y: 0 },
          data: { node_type: 'skill' },
        },
      ] as never),
    ).toEqual([
      { nodeId: '(missing-id)', nodeType: '(missing nodeType)' },
      { nodeId: 'unknown', nodeType: 'future-node' },
    ]);
  });

  it('MCP collector 应返回所有可观察校验问题并使用缺失 id 占位', () => {
    const invalid = collectInvalidAgentCanvasMcpToolNodes([
      {
        id: '',
        type: 'tool',
        position: { x: 0, y: 0 },
        data: {
          nodeType: 'mcp-tool',
          config: {
            enabledToolIds: ['tool-1', 'missing'],
            tools: [
              {
                id: 'tool-1',
                name: '',
              },
            ],
          },
        },
      },
      {
        id: 'valid',
        type: 'tool',
        position: { x: 0, y: 0 },
        data: {
          nodeType: 'mcp-tool',
          mcpServerConfigId: 'cfg',
          toolName: 'search',
        },
      },
      {
        id: 'text',
        type: 'output',
        position: { x: 0, y: 0 },
        data: { nodeType: 'text' },
      },
    ] as never);

    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({
      nodeId: '(missing-id)',
      enabledToolIds: ['tool-1', 'missing'],
      missingToolIds: ['missing'],
    });
    expect(invalid[0]?.issues).toEqual(
      expect.arrayContaining([
        '缺少 mcpServerConfigId',
        expect.stringContaining('missing'),
        expect.stringContaining('tool-1'),
      ]),
    );
  });

  it('version snapshot 应默认缺失 systemPrompt 为 null 并保持额外字段', () => {
    const migrated = migrateAgentVersionSnapshot({
      runtimeMode: 'no_sandbox',
      nodes: [],
      edges: [],
      viewport: null,
      metadata: {
        nodeCount: 0,
        edgeCount: 0,
        createdFromVersion: 7,
      },
    } as never);

    expect(migrated.changed).toBe(false);
    expect(migrated.snapshot).toMatchObject({
      runtimeMode: 'no_sandbox',
      systemPrompt: null,
      metadata: { createdFromVersion: 7 },
    });
  });

  it('workflow 非 agent、空 prompt 和已有 canonical 边不应生成重复输入', () => {
    const migrated = migrateWorkflowGraph({
      nodes: [
        {
          id: 'other',
          type: 'text',
          position: { x: 0, y: 0 },
          data: { nodeType: 'text' },
        },
        {
          id: 'blank',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { nodeType: 'agent', config: { system_prompt: '  ' } },
        },
        {
          id: 'connected',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'agent',
            system_prompt: 'legacy',
            config: { systemPrompt: 'fallback' },
          },
        },
      ],
      edges: [
        {
          id: 'existing',
          source: 'other',
          target: 'connected',
          targetHandle: 'SYSTEM_PROMPT_IN',
        },
      ],
    });

    expect(migrated.nodes).toHaveLength(3);
    expect(migrated.edges).toHaveLength(1);
    expect(migrated.nodes[2]?.data).not.toHaveProperty('system_prompt');
    expect(migrated.nodes[2]).not.toHaveProperty('data.config.systemPrompt');
  });

  it('workflow prompt id/edge 冲突应递增并优先读取 data.systemPrompt', () => {
    const migrated = migrateWorkflowGraph({
      nodes: [
        {
          id: 'agent',
          type: 'agent',
          position: undefined as never,
          data: {
            nodeType: 'agent',
            systemPrompt: ' top-level ',
            config: { systemPrompt: 'nested' },
          },
        },
        {
          id: 'agent__system-prompt',
          type: 'text',
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'agent__system-prompt-2',
          type: 'text',
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      edges: [
        { id: 'agent__system-prompt__edge', source: 'x', target: 'y' },
        { id: 'agent__system-prompt__edge-2', source: 'x', target: 'y' },
      ],
    });

    expect(migrated.nodes).toContainEqual(
      expect.objectContaining({
        id: 'agent__system-prompt-3',
        position: { x: 40, y: 320 },
        data: expect.objectContaining({ config: { text: 'top-level' } }),
      }),
    );
    expect(migrated.edges).toContainEqual(
      expect.objectContaining({ id: 'agent__system-prompt__edge-3' }),
    );
  });
});
