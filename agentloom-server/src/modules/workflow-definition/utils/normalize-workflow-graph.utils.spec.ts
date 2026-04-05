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
});
