import { describe, expect, it } from 'vitest';

import { normalizeWorkflowNodesAndEdges } from './normalize-workflow-graph.utils';

describe('normalizeWorkflowNodesAndEdges', () => {
  it('应将 self-evolution 生成的 legacy workflow-node 与简写 handle 归一化为 canonical workflow graph', () => {
    const { nodes, edges } = normalizeWorkflowNodesAndEdges(
      [
        {
          id: 'trigger-a',
          type: 'workflow-node',
          position: { x: 100, y: 260 },
          data: {
            label: 'Manual Trigger',
            node_type: 'manual-trigger',
            input_ports: [],
            output_ports: [{ id: 'exec-out' }, { id: 'payload-out' }],
          },
        },
        {
          id: 'prompt-a',
          type: 'workflow-node',
          position: { x: 380, y: 260 },
          data: {
            label: 'Prompt',
            node_type: 'input-preprocessor',
            input_ports: [
              { id: 'exec-in' },
              { id: 'text-in' },
              { id: 'json-in' },
            ],
            output_ports: [
              { id: 'exec-out' },
              { id: 'text-out' },
              { id: 'json-out' },
            ],
            transform_type: 'template',
            output_format: 'text',
          },
        },
        {
          id: 'agent-a',
          type: 'workflow-node',
          position: { x: 660, y: 260 },
          data: {
            label: 'Agent',
            node_type: 'agent',
            input_ports: [{ id: 'text-in' }],
            output_ports: [{ id: 'agent-out' }, { id: 'structured-out' }],
            selected_agent_id: 'agent-def-1',
            agent_version_id: 'agent-version-1',
          },
        },
        {
          id: 'text-a',
          type: 'workflow-node',
          position: { x: 940, y: 260 },
          data: {
            label: 'Text Output',
            node_type: 'text-output',
            input_ports: [{ id: 'exec-in' }, { id: 'content-in' }],
            output_ports: [],
          },
        },
      ],
      [
        {
          id: 'edge-trigger-prompt',
          source: 'trigger-a',
          target: 'prompt-a',
          source_handle: 'payload',
          target_handle: 'json',
        } as unknown as never,
        {
          id: 'edge-prompt-agent',
          source: 'prompt-a',
          target: 'agent-a',
          source_handle: 'text',
          target_handle: 'text',
        } as unknown as never,
        {
          id: 'edge-agent-text',
          source: 'agent-a',
          target: 'text-a',
          source_handle: 'agent',
          target_handle: 'content',
        } as unknown as never,
      ],
    );

    expect(nodes.map((node) => node.type)).toEqual([
      'trigger',
      'tool',
      'agent',
      'output',
    ]);
    expect(nodes[0]?.data).toMatchObject({
      nodeType: 'manual-trigger',
      category: 'trigger',
      inputPorts: [],
      outputPorts: [
        {
          id: 'exec-out',
          direction: 'output',
          dataType: 'exec',
          schema: { kind: 'exec' },
        },
        {
          id: 'payload-out',
          direction: 'output',
          dataType: 'json',
          schema: { kind: 'json' },
        },
      ],
    });
    expect(nodes[1]?.data).toMatchObject({
      nodeType: 'input-preprocessor',
      category: 'tool',
      transformType: 'template',
      outputFormat: 'text',
    });
    expect(nodes[2]?.data).toMatchObject({
      nodeType: 'agent',
      category: 'agent',
      selectedAgentId: 'agent-def-1',
      agentVersionId: 'agent-version-1',
    });
    expect(nodes[2]?.data.inputPorts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'exec-in',
          dataType: 'exec',
          schema: expect.objectContaining({ kind: 'exec' }),
        }),
        expect.objectContaining({
          id: 'text-in',
          dataType: 'text',
          schema: expect.objectContaining({ kind: 'text' }),
        }),
      ]),
    );

    expect(edges).toEqual([
      {
        id: 'edge-trigger-prompt',
        source: 'trigger-a',
        target: 'prompt-a',
        sourceHandle: 'payload-out',
        targetHandle: 'json-in',
      },
      {
        id: 'edge-prompt-agent',
        source: 'prompt-a',
        target: 'agent-a',
        sourceHandle: 'text-out',
        targetHandle: 'text-in',
      },
      {
        id: 'edge-agent-text',
        source: 'agent-a',
        target: 'text-a',
        sourceHandle: 'agent-out',
        targetHandle: 'content-in',
      },
    ]);
  });

  it('应保持已是 canonical 的 workflow graph 语义稳定', () => {
    const canonicalNodes = [
      {
        id: 'node-1',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {
          label: 'Manual Trigger',
          nodeType: 'manual-trigger',
          category: 'trigger',
          inputPorts: [],
          outputPorts: [
            {
              id: 'exec-out',
              label: '',
              direction: 'output',
              dataType: 'exec',
              required: false,
              multiple: false,
              maxConnections: 1,
              schema: {
                kind: 'exec',
                title: '',
              },
            },
            {
              id: 'payload-out',
              label: '触发数据',
              direction: 'output',
              dataType: 'json',
              required: false,
              multiple: false,
              maxConnections: 1,
              schema: {
                kind: 'json',
                shape: 'object',
                title: '触发数据',
                properties: {},
                additionalProperties: true,
              },
            },
          ],
        },
      },
    ];
    const canonicalEdges = [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'payload-out',
        targetHandle: 'json-in',
      },
    ];

    const normalized = normalizeWorkflowNodesAndEdges(
      canonicalNodes,
      canonicalEdges,
    );

    expect(normalized.nodes).toEqual(canonicalNodes);
    expect(normalized.edges).toEqual(canonicalEdges);
  });

  it('应为 text source node 与 workflow agent 的 system-prompt-in 端口补齐 canonical 元数据', () => {
    const { nodes, edges } = normalizeWorkflowNodesAndEdges(
      [
        {
          id: 'text-node',
          type: 'workflow-node',
          position: { x: 0, y: 0 },
          data: {
            node_type: 'text',
            input_ports: [],
            output_ports: [{ id: 'text-out' }],
          },
        },
        {
          id: 'agent-node',
          type: 'workflow-node',
          position: { x: 240, y: 0 },
          data: {
            node_type: 'agent',
            input_ports: [
              { id: 'exec-in' },
              { id: 'text-in' },
              { id: 'system-prompt-in' },
            ],
            output_ports: [{ id: 'agent-out' }, { id: 'structured-out' }],
          },
        },
      ],
      [
        {
          id: 'edge-text-agent',
          source: 'text-node',
          target: 'agent-node',
          source_handle: 'text',
          target_handle: 'system_prompt',
        } as unknown as never,
      ],
    );

    expect(nodes[0]?.type).toBe('output');
    expect(nodes[0]?.data).toMatchObject({
      nodeType: 'text',
      category: 'output',
      outputPorts: [
        expect.objectContaining({
          id: 'text-out',
          dataType: 'text',
          direction: 'output',
        }),
      ],
    });
    expect(nodes[1]?.data.inputPorts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'system-prompt-in',
          dataType: 'text',
          direction: 'input',
        }),
      ]),
    );
    expect(edges).toEqual([
      {
        id: 'edge-text-agent',
        source: 'text-node',
        target: 'agent-node',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
    ]);
  });

  it('应给版本快照里只有端口 id 的自定义端口补上默认 json schema', () => {
    const { nodes } = normalizeWorkflowNodesAndEdges(
      [
        {
          id: 'loop-a',
          type: 'workflow-node',
          position: { x: 0, y: 0 },
          data: {
            node_type: 'loop',
            input_ports: [
              { id: 'exec-in' },
              { id: 'state-in' },
              { id: 'input-0' },
            ],
            output_ports: [{ id: 'exec-out' }, { id: 'review_out' }],
          },
        },
      ],
      [],
    );

    expect(nodes[0]?.data.inputPorts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'exec-in',
          dataType: 'exec',
          schema: expect.objectContaining({ kind: 'exec' }),
        }),
        expect.objectContaining({
          id: 'state-in',
          dataType: 'json',
          schema: expect.objectContaining({ kind: 'json' }),
        }),
      ]),
    );
    expect(nodes[0]?.data.outputPorts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'review_out',
          direction: 'output',
          dataType: 'json',
          schema: expect.objectContaining({ kind: 'json' }),
        }),
      ]),
    );
  });
  it('应将 unknown node 的自定义端口按 id、legacy 类型与 schema 归一化而不改写节点类型', () => {
    const { nodes } = normalizeWorkflowNodesAndEdges(
      [
        {
          id: 'custom-node',
          type: 'mystery-widget',
          position: { x: 0, y: 0 },
          data: {
            input_ports: [
              {
                id: 'custom_in',
                label: ' Custom input ',
                description: ' details ',
                data_type: 'number',
                accepts_any_data_type: false,
                required: true,
                multiple: true,
                max_connections: null,
                schema: {
                  kind: 'number',
                  title: ' Amount ',
                  description: ' numeric ',
                  nullable: true,
                  format: ' decimal ',
                  examples: [1, 2],
                },
              },
              {
                id: 'items-in',
                schema: {
                  kind: 'json',
                  shape: 'array',
                  title: 'Items',
                  nullable: false,
                  items: { kind: 'text', title: 'Name' },
                  minItems: 1,
                  maxItems: 3,
                },
              },
              {
                id: 'object-in',
                schema: {
                  kind: 'json',
                  shape: 'object',
                  title: 'Payload',
                  properties: {
                    valid: { kind: 'boolean', title: 'Flag' },
                    ignored: { kind: 'unknown' },
                  },
                  required: ['valid', '', 3],
                  additional_properties: false,
                },
              },
              { id: '', dataType: 'text' },
              null,
            ],
            output_ports: [
              { id: 'model-out' },
              { id: 'reply-out' },
              { id: 'volume-out' },
              { id: 'sandbox-out' },
              { id: 'knowledge-out' },
              { id: 'skill-out' },
              { id: 'tools-out' },
              { id: 'memory-out' },
              { id: 'sub-agents-out' },
              { id: 'branch-1' },
              { id: 'image-result', dataType: 'image' },
            ],
          },
        },
      ] as never,
      [],
    );

    expect(nodes[0]).toMatchObject({
      type: 'mystery-widget',
      data: {
        inputPorts: [
          {
            id: 'custom_in',
            label: 'Custom input',
            direction: 'input',
            dataType: 'json',
            acceptsAnyDataType: false,
            description: 'details',
            required: true,
            multiple: true,
            maxConnections: 1,
            schema: {
              kind: 'json',
              shape: 'object',
              title: 'Amount',
              description: 'numeric',
              nullable: true,
              properties: {},
              additionalProperties: true,
            },
          },
          {
            id: 'items-in',
            dataType: 'array',
            schema: {
              kind: 'json',
              shape: 'array',
              title: 'Items',
              nullable: false,
              items: { kind: 'text', title: 'Name' },
              minItems: 1,
              maxItems: 3,
            },
          },
          {
            id: 'object-in',
            dataType: 'json',
            schema: {
              kind: 'json',
              shape: 'object',
              title: 'Payload',
              properties: {
                valid: { kind: 'json', shape: 'object', title: 'Flag' },
              },
              required: ['valid'],
              additionalProperties: false,
            },
          },
        ],
      },
    });
    expect(
      (nodes[0]?.data.outputPorts as Array<Record<string, unknown>>).map(
        ({ id, dataType }) => [id, dataType],
      ),
    ).toEqual([
      ['model-out', 'model'],
      ['reply-out', 'text'],
      ['volume-out', 'volume'],
      ['sandbox-out', 'sandbox'],
      ['knowledge-out', 'knowledge'],
      ['skill-out', 'skill'],
      ['tools-out', 'tool'],
      ['memory-out', 'memory'],
      ['sub-agents-out', 'agent'],
      ['branch-1', 'json'],
      ['image-result', 'image'],
    ]);
  });

  it('应合并 canonical 模板端口重复项并保留最后一项的可观察元数据', () => {
    const { nodes } = normalizeWorkflowNodesAndEdges(
      [
        {
          id: 'agent',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            agent_runtime_mode: 'no_sandbox',
            input_ports: [
              { id: 'text-in', label: 'old' },
              { id: 'text-in', label: 'latest', required: true },
              { id: 'custom-input', data_type: 'boolean' },
            ],
            output_ports: [],
            config: {
              agent_runtime_mode: 'no_sandbox',
              output_fields: ['answer'],
              outputFields: ['canonical'],
              query_params: { q: 1 },
            },
          },
        },
      ],
      [],
    );

    const inputPorts = nodes[0]?.data.inputPorts as Array<
      Record<string, unknown>
    >;
    expect(inputPorts.filter((port) => port.id === 'text-in')).toEqual([
      expect.objectContaining({ label: 'latest', required: true }),
    ]);
    expect(inputPorts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'sandbox-in' })]),
    );
    expect(inputPorts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'custom-input',
          direction: 'input',
          dataType: 'json',
        }),
      ]),
    );
    expect(nodes[0]?.data.config).toMatchObject({
      agent_runtime_mode: 'no_sandbox',
      outputFields: ['canonical'],
      queryParams: { q: 1 },
    });
    expect(nodes[0]?.data.config).not.toHaveProperty('output_fields');
  });

  it('应按 canonical、legacy、null 与缺失 handle 的优先级稳定归一化边', () => {
    const { edges } = normalizeWorkflowNodesAndEdges(
      [
        {
          id: 'source',
          type: 'workflow-node',
          position: { x: 0, y: 0 },
          data: {
            node_type: 'text',
            output_ports: [{ id: 'text-out' }, { id: 'text_output' }],
          },
        },
        {
          id: 'target',
          type: 'workflow-node',
          position: { x: 1, y: 0 },
          data: {
            node_type: 'text-output',
            input_ports: [{ id: 'content-in' }],
          },
        },
      ],
      [
        {
          id: 'canonical-wins',
          source: 'source',
          target: 'target',
          sourceHandle: ' text-out ',
          targetHandle: '',
          source_handle: 'ignored',
          target_handle: 'content',
        },
        {
          id: 'explicit-null',
          source: 'source',
          target: 'target',
          sourceHandle: null,
          targetHandle: null,
          source_handle: 'text',
          target_handle: 'content',
        },
        {
          id: 'legacy-only',
          source: 'source',
          target: 'target',
          source_handle: 'unmatched',
          target_handle: 'content_input',
        },
        {
          id: 'missing-nodes',
          source: 'missing',
          target: 'also-missing',
          source_handle: 'raw',
        },
      ] as never,
    );

    expect(edges).toEqual([
      {
        id: 'canonical-wins',
        source: 'source',
        target: 'target',
        sourceHandle: 'text-out',
        targetHandle: '',
      },
      {
        id: 'explicit-null',
        source: 'source',
        target: 'target',
        sourceHandle: null,
        targetHandle: null,
      },
      {
        id: 'legacy-only',
        source: 'source',
        target: 'target',
        sourceHandle: 'unmatched',
        targetHandle: 'content-in',
      },
      {
        id: 'missing-nodes',
        source: 'missing',
        target: 'also-missing',
        sourceHandle: 'raw',
      },
    ]);
  });

  it('应在节点类型或 data 无法识别时保留原始类别并提供空端口集合', () => {
    expect(
      normalizeWorkflowNodesAndEdges(
        [
          {
            id: 'category-only',
            type: 'control',
            position: { x: 0, y: 0 },
            data: null,
          },
          {
            id: 'legacy-category',
            type: 'workflow-node',
            position: { x: 0, y: 0 },
            data: { node_category: 'plugin' },
          },
        ] as never,
        undefined,
      ),
    ).toEqual({
      nodes: [
        expect.objectContaining({
          id: 'category-only',
          type: 'control',
          data: { category: 'control', inputPorts: [], outputPorts: [] },
        }),
        expect.objectContaining({
          id: 'legacy-category',
          type: 'plugin',
          data: {
            category: 'plugin',
            inputPorts: [],
            outputPorts: [],
          },
        }),
      ],
      edges: [],
    });
    expect(normalizeWorkflowNodesAndEdges(null, null)).toEqual({
      nodes: [],
      edges: [],
    });
  });
  it('应为所有内建节点补齐可消费的默认端口 schema 与连接元数据', () => {
    const nodeTypes = [
      'llm-model',
      'http-tool',
      'code-tool',
      'mcp-tool',
      'sandbox',
      'manual-trigger',
      'schedule-trigger',
      'webhook-trigger',
      'api-event-trigger',
      'knowledge-base',
      'text',
      'text-output',
      'json-output',
      'condition',
      'loop',
      'iteration',
      'loop-start',
      'iteration-start',
      'loop-state',
      'result',
      'break',
      'continue',
      'reusable-block',
      'smart-routing',
      'plugin',
      'input-preprocessor',
      'memory',
      'agent',
      'skill',
      'workspace',
      'merge',
    ];

    const { nodes } = normalizeWorkflowNodesAndEdges(
      nodeTypes.map((nodeType, index) => ({
        id: `node-${index}`,
        type: 'workflow-node',
        position: { x: index, y: 0 },
        data: { node_type: nodeType },
      })),
      [],
    );

    expect(nodes.map((node) => node.data.nodeType)).toEqual(nodeTypes);
    for (const node of nodes) {
      const ports = [
        ...(node.data.inputPorts as Array<Record<string, unknown>>),
        ...(node.data.outputPorts as Array<Record<string, unknown>>),
      ];
      for (const port of ports) {
        expect(port).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            label: expect.any(String),
            direction: expect.stringMatching(/^(input|output)$/),
            dataType: expect.any(String),
            required: expect.any(Boolean),
            multiple: expect.any(Boolean),
            schema: expect.objectContaining({
              kind: expect.any(String),
              title: expect.any(String),
            }),
          }),
        );
        expect(port).toHaveProperty('maxConnections');
      }
    }
  });

  it('应归一化节点级 legacy metadata 且 canonical 值优先', () => {
    const { nodes } = normalizeWorkflowNodesAndEdges(
      [
        {
          id: 'metadata',
          type: 'workflow-node',
          position: { x: 0, y: 0 },
          data: {
            node_type: 'input-preprocessor',
            node_category: 'tool',
            selected_agent_id: 'agent-legacy',
            selectedAgentId: 'agent-current',
            agent_version_id: 'version-legacy',
            agent_name: ' Legacy Agent ',
            transform_type: 'template',
            output_format: 'json',
            agent_runtime_mode: 'sandbox',
            config: {
              default_state: { count: 0 },
              output_mode: 'all',
              is_collapsed: true,
              output_key: 'result',
              expose_previous_result: true,
              expose_is_first: false,
              expose_total: true,
              expose_is_last: false,
              auth_type: 'bearer',
              auth_config: { token: 'secret' },
              ip_whitelist: ['127.0.0.1'],
              event_source: 'github',
              event_type: 'push',
              filter_expression: 'payload.ok',
              knowledge_base_id: 'kb-1',
              skill_id: 'skill-1',
              skill_name: 'Summarize',
              skill_description: 'summary',
              workspace_id: 'ws-1',
              workspace_name: 'Workspace',
              memory_instance_id: 'memory-1',
              merge_key: 'id',
              transform_type: 'legacy-transform',
              output_format: 'legacy-output',
            },
          },
        },
      ],
      [],
    );

    expect(nodes[0]?.data).toMatchObject({
      nodeType: 'input-preprocessor',
      category: 'tool',
      selectedAgentId: 'agent-current',
      agentVersionId: 'version-legacy',
      agentName: 'Legacy Agent',
      transformType: 'template',
      outputFormat: 'json',
      agentRuntimeMode: 'sandbox',
      config: {
        defaultState: { count: 0 },
        outputMode: 'all',
        isCollapsed: true,
        outputKey: 'result',
        exposePreviousResult: true,
        exposeIsFirst: false,
        exposeTotal: true,
        exposeIsLast: false,
        authType: 'bearer',
        authConfig: { token: 'secret' },
        ipWhitelist: ['127.0.0.1'],
        eventSource: 'github',
        eventType: 'push',
        filterExpression: 'payload.ok',
        knowledgeBaseId: 'kb-1',
        skillId: 'skill-1',
        skillName: 'Summarize',
        skillDescription: 'summary',
        workspaceId: 'ws-1',
        workspaceName: 'Workspace',
        memoryInstanceId: 'memory-1',
        mergeKey: 'id',
        transformType: 'legacy-transform',
        outputFormat: 'legacy-output',
      },
    });
    expect(nodes[0]?.data).not.toHaveProperty('selected_agent_id');
    expect(nodes[0]?.data.config).not.toHaveProperty('default_state');
  });
});
