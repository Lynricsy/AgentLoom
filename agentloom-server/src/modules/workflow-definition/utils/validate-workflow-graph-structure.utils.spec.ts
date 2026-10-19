import { describe, expect, it } from 'vitest';

import type { ReactFlowEdge, ReactFlowNode } from '../../../database/schema';
import { normalizeWorkflowNodesAndEdges } from './normalize-workflow-graph.utils';
import { collectWorkflowGraphStructureErrors } from './validate-workflow-graph-structure.utils';

function node(
  id: string,
  nodeType: string,
  extra: Partial<ReactFlowNode> = {},
): ReactFlowNode {
  return {
    id,
    type: 'workflow-node',
    position: { x: 0, y: 0 },
    data: { nodeType },
    ...extra,
  };
}

function execEdge(source: string, target: string): ReactFlowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle: 'exec-out',
    targetHandle: 'exec-in',
  };
}

function collect(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): string[] {
  const normalized = normalizeWorkflowNodesAndEdges(nodes, edges);
  return collectWorkflowGraphStructureErrors(
    normalized.nodes,
    normalized.edges,
  );
}

describe('collectWorkflowGraphStructureErrors', () => {
  it('合法 DAG 与 legacy 下划线 handle 不报错', () => {
    expect(
      collect(
        [node('trig', 'manual-trigger'), node('m', 'merge')],
        [
          {
            id: 'e1',
            source: 'trig',
            target: 'm',
            sourceHandle: 'exec_out',
            targetHandle: 'exec_in',
          },
        ],
      ),
    ).toEqual([]);
  });

  it('顶层环路报错', () => {
    expect(
      collect(
        [
          node('trig', 'manual-trigger'),
          node('a', 'merge'),
          node('b', 'merge'),
        ],
        [execEdge('trig', 'a'), execEdge('a', 'b'), execEdge('b', 'a')],
      ),
    ).toEqual(['工作流图存在环路，执行顺序无法确定']);
  });

  it('复合容器内部环路单独报错，容器与内部节点不混成一张图', () => {
    expect(
      collect(
        [
          node('trig', 'manual-trigger'),
          node('loop', 'loop', { data: { nodeType: 'loop', label: '循环' } }),
          node('x', 'merge', { parentId: 'loop' }),
          node('y', 'merge', { parentId: 'loop' }),
        ],
        [execEdge('trig', 'loop'), execEdge('x', 'y'), execEdge('y', 'x')],
      ),
    ).toEqual(['复合节点 「循环」(loop) 内部的连线存在环路']);
  });

  it('悬空端点与不存在的端口逐条报错', () => {
    expect(
      collect(
        [node('trig', 'manual-trigger'), node('m', 'merge')],
        [
          {
            id: 'bad-source-port',
            source: 'trig',
            target: 'm',
            sourceHandle: 'nope-out',
            targetHandle: 'exec-in',
          },
          {
            id: 'bad-target-port',
            source: 'trig',
            target: 'm',
            sourceHandle: 'payload-out',
            targetHandle: 'nope-in',
          },
          execEdge('ghost-src', 'm'),
          execEdge('m', 'ghost'),
        ],
      ),
    ).toEqual([
      '连线 bad-source-port 的源端口 nope-out 不存在于节点 trig',
      '连线 bad-target-port 的目标端口 nope-in 不存在于节点 m',
      '连线 ghost-src-m 的源节点 ghost-src 不存在',
      '连线 m-ghost 的目标节点 ghost 不存在',
    ]);
  });

  it('节点没有任何端口声明时跳过该端的端口校验', () => {
    expect(
      collect(
        [node('trig', 'manual-trigger'), node('plug', 'plugin')],
        [
          {
            id: 'to-plugin',
            source: 'trig',
            target: 'plug',
            sourceHandle: 'payload-out',
            targetHandle: 'any-dynamic-in',
          },
        ],
      ),
    ).toEqual([]);
  });

  it('节点自带的额外端口（如条件分支）视为合法 handle', () => {
    expect(
      collect(
        [
          node('trig', 'manual-trigger'),
          node('cond', 'condition', {
            data: {
              nodeType: 'condition',
              outputPorts: [
                { id: 'branch-0' },
                { id: 'branch-1' },
                { id: 'else' },
              ],
            },
          }),
          node('m', 'merge'),
        ],
        [
          execEdge('trig', 'cond'),
          {
            id: 'b1',
            source: 'cond',
            target: 'm',
            sourceHandle: 'branch-1',
            targetHandle: 'exec-in',
          },
        ],
      ),
    ).toEqual([]);
  });

  it('portMappingMetadata 声明的动态端口（如 MCP 工具参数）视为合法 handle', () => {
    const nodes = [
      node('src', 'text', {
        data: {
          nodeType: 'text',
          portMappingMetadata: {
            outputs: [{ name: 'output-text', dataType: 'text' }],
          },
        },
      }),
      node('tool', 'mcp-tool', {
        data: {
          nodeType: 'mcp-tool',
          portMappingMetadata: {
            inputs: [{ name: 'query', dataType: 'text' }],
          },
        },
      }),
    ];
    const dataEdge = (targetHandle: string): ReactFlowEdge => ({
      id: `e-${targetHandle}`,
      source: 'src',
      target: 'tool',
      sourceHandle: 'output-text',
      targetHandle,
    });

    expect(collect(nodes, [dataEdge('query')])).toEqual([]);
    expect(collect(nodes, [dataEdge('nope')])).toEqual([
      expect.stringContaining('目标端口 nope'),
    ]);
  });
});
