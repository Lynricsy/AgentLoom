import { describe, expect, it } from 'vitest';

import { buildMarketplacePreviewGraph } from './marketplace-preview-graph.util';

function sourceNode(overrides: Record<string, unknown>) {
  return {
    id: 'node',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    category: 'tool',
    nodeType: 'http-tool',
    parentId: null,
    ...overrides,
  };
}

describe('buildMarketplacePreviewGraph', () => {
  it('容器内子节点沿父链累加成绝对坐标，并排在容器之后', () => {
    const graph = buildMarketplacePreviewGraph({
      nodes: [
        sourceNode({ id: 'child', x: 30, y: 40, parentId: 'loop' }),
        sourceNode({ id: 'grandchild', x: 5, y: 6, parentId: 'child' }),
        sourceNode({ id: 'loop', x: 100, y: 200, category: 'control' }),
      ],
      edges: [],
    });

    expect(graph?.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'loop', x: 100, y: 200 },
      { id: 'child', x: 130, y: 240 },
      { id: 'grandchild', x: 135, y: 246 },
    ]);
  });

  it('父节点缺失或成环时按顶层坐标处理而不是丢节点', () => {
    const graph = buildMarketplacePreviewGraph({
      nodes: [
        sourceNode({ id: 'orphan', x: 7, y: 8, parentId: 'gone' }),
        sourceNode({ id: 'a', x: 1, y: 1, parentId: 'b' }),
        sourceNode({ id: 'b', x: 10, y: 10, parentId: 'a' }),
      ],
      edges: [],
    });

    const byId = Object.fromEntries(
      (graph?.nodes ?? []).map((node) => [node.id, node]),
    );
    expect(byId.orphan).toMatchObject({ x: 7, y: 8 });
    expect(Object.keys(byId).sort()).toEqual(['a', 'b', 'orphan']);
  });

  it('坏字段就地兜底，缺 id 的节点与悬空连线被丢弃', () => {
    const graph = buildMarketplacePreviewGraph({
      nodes: [
        { id: 'raw', x: 'oops', y: null, width: 0, height: null },
        { x: 1, y: 2 },
        'not-a-node',
      ],
      edges: [
        { source: 'raw', target: 'raw' },
        { source: 'raw', target: 'missing' },
        { source: 'raw' },
      ],
    });

    expect(graph).toEqual({
      nodes: [
        {
          id: 'raw',
          x: 0,
          y: 0,
          width: 240,
          height: 160,
          category: null,
          nodeType: null,
        },
      ],
      edges: [{ source: 'raw', target: 'raw' }],
    });
  });

  it('插件（无快照）或没有可画节点时返回 null', () => {
    expect(buildMarketplacePreviewGraph(null)).toBeNull();
    expect(buildMarketplacePreviewGraph({ nodes: [], edges: [] })).toBeNull();
  });
});
