import { describe, expect, it } from 'vitest';

import type { ReactFlowEdge, ReactFlowNode } from '../../../database/schema';
import { ReusableBlockExpansionException } from '../execution.exceptions';
import { expandReusableBlocks } from '../reusable-block-expansion.util';

function node(
  id: string,
  nodeType: string,
  data: Record<string, unknown> = {},
  extra: Partial<ReactFlowNode> = {},
): ReactFlowNode {
  return {
    id,
    type: 'tool',
    position: { x: 0, y: 0 },
    data: { nodeType, ...data },
    ...extra,
  };
}

function edge(
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
): ReactFlowEdge {
  return {
    id: `${source}:${sourceHandle}->${target}:${targetHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle,
  };
}

/** 块内部：pre（输入预处理器）→ out（JSON Output 前的透传），块暴露 1 个输入、1 个输出。 */
function blockNode(id: string, extra: Partial<ReactFlowNode> = {}) {
  return node(
    id,
    'reusable-block',
    {
      blockId: 'block-def-1',
      blockName: '分析块',
      blockDefinition: {
        nodes: [
          node('pre', 'input-preprocessor', {
            transformType: 'jmespath',
            expression: '"json-in"',
          }),
          node('code', 'code-tool'),
        ],
        edges: [edge('pre', 'code', 'json-out', 'input-in')],
        inputPorts: [
          {
            id: 'block-in',
            label: '数据',
            dataType: 'json',
            sourceNodeId: 'pre',
            sourcePortId: 'json-in',
          },
        ],
        outputPorts: [
          {
            id: 'block-out',
            label: '结果',
            dataType: 'json',
            sourceNodeId: 'code',
            sourcePortId: 'result-out',
          },
        ],
      },
    },
    extra,
  );
}

describe('expandReusableBlocks', () => {
  it('不含块时原样返回', () => {
    const nodes = [node('a', 'text')];
    const edges: ReactFlowEdge[] = [];

    expect(expandReusableBlocks(nodes, edges)).toEqual({ nodes, edges });
  });

  it('块节点替换为 blockId::innerId 内部节点，外部边按端口映射改写到内部节点', () => {
    const result = expandReusableBlocks(
      [node('src', 'text'), blockNode('blk'), node('sink', 'json-output')],
      [
        edge('src', 'blk', 'text-out', 'block-in'),
        edge('blk', 'sink', 'block-out', 'content-in'),
      ],
    );

    expect(result.nodes.map((n) => n.id)).toEqual([
      'src',
      'blk::pre',
      'blk::code',
      'sink',
    ]);
    expect(
      result.edges.map((e) => [
        e.source,
        e.sourceHandle,
        e.target,
        e.targetHandle,
      ]),
    ).toEqual([
      ['blk::pre', 'json-out', 'blk::code', 'input-in'],
      ['src', 'text-out', 'blk::pre', 'json-in'],
      ['blk::code', 'result-out', 'sink', 'content-in'],
    ]);
    expect(new Set(result.edges.map((e) => e.id)).size).toBe(3);
  });

  it('嵌套块递归展开，ID 逐层加前缀', () => {
    const outer = node('outer', 'reusable-block', {
      blockName: '外层',
      blockDefinition: {
        nodes: [blockNode('inner')],
        edges: [],
        inputPorts: [
          {
            id: 'outer-in',
            label: 'in',
            dataType: 'json',
            sourceNodeId: 'inner',
            sourcePortId: 'block-in',
          },
        ],
        outputPorts: [],
      },
    });

    const result = expandReusableBlocks(
      [node('src', 'text'), outer],
      [edge('src', 'outer', 'text-out', 'outer-in')],
    );

    expect(result.nodes.map((n) => n.id)).toEqual([
      'src',
      'outer::inner::pre',
      'outer::inner::code',
    ]);
    expect(result.edges).toContainEqual(
      expect.objectContaining({
        source: 'src',
        target: 'outer::inner::pre',
        targetHandle: 'json-in',
      }),
    );
  });

  it('块位于 Loop 容器内时，内部顶层节点继承块的 parentId', () => {
    const result = expandReusableBlocks(
      [node('loop', 'loop'), blockNode('blk', { parentId: 'loop' })],
      [],
    );

    expect(
      result.nodes
        .filter((n) => n.id.startsWith('blk::'))
        .map((n) => n.parentId),
    ).toEqual(['loop', 'loop']);
  });

  it.each([
    [
      '外部边连到块上不存在的端口',
      [edge('src', 'blk', 'text-out', 'missing-port')],
      '端口 "missing-port"',
    ],
    [
      '块端口缺少内部映射',
      [edge('src', 'blk', 'text-out', 'unmapped')],
      '没有映射到块内节点',
    ],
  ])('%s 时抛出 ReusableBlockExpansionException', (_case, edges, message) => {
    const block = blockNode('blk');
    const definition = block.data.blockDefinition as {
      inputPorts: Array<Record<string, unknown>>;
    };
    definition.inputPorts.push({
      id: 'unmapped',
      label: 'x',
      dataType: 'json',
    });

    expect(() =>
      expandReusableBlocks([node('src', 'text'), block], edges),
    ).toThrow(
      expect.objectContaining({
        constructor: ReusableBlockExpansionException,
        detail: expect.stringContaining(message),
      }),
    );
  });

  it('块节点缺少 blockDefinition 时抛出 ReusableBlockExpansionException', () => {
    expect(() =>
      expandReusableBlocks([node('blk', 'reusable-block', {})], []),
    ).toThrow(ReusableBlockExpansionException);
  });
});
