import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  ReactFlowEdge,
  ReactFlowNode,
  ReactFlowViewport,
} from '../../../database/schema/workflow-definitions.schema';
import {
  cloneDefinitionWithNewIds,
  type CloneableDefinition,
} from '../utils/clone-template.utils';

// 稳定的 UUID mock 用于断言
const MOCK_UUIDS = [
  '01900000-0000-7000-0000-000000000001',
  '01900000-0000-7000-0000-000000000002',
  '01900000-0000-7000-0000-000000000003',
  '01900000-0000-7000-0000-000000000004',
  '01900000-0000-7000-0000-000000000005',
  '01900000-0000-7000-0000-000000000006',
  '01900000-0000-7000-0000-000000000007',
  '01900000-0000-7000-0000-000000000008',
];

let uuidIndex = 0;

vi.mock('uuid', () => ({
  v7: () => MOCK_UUIDS[uuidIndex++],
}));

function createNode(overrides: Partial<ReactFlowNode> = {}): ReactFlowNode {
  return {
    id: 'old-node-1',
    type: 'agentNode',
    position: { x: 100, y: 200 },
    data: { label: 'Test' },
    ...overrides,
  };
}

function createEdge(overrides: Partial<ReactFlowEdge> = {}): ReactFlowEdge {
  return {
    id: 'old-edge-1',
    source: 'old-node-1',
    target: 'old-node-2',
    ...overrides,
  };
}

const DEFAULT_VIEWPORT: ReactFlowViewport = { x: 0, y: 0, zoom: 1 };

describe('cloneDefinitionWithNewIds', () => {
  beforeEach(() => {
    uuidIndex = 0;
  });

  it('应当为所有节点分配新 ID', () => {
    const definition: CloneableDefinition = {
      nodes: [createNode({ id: 'node-a' }), createNode({ id: 'node-b' })],
      edges: [],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toBe(MOCK_UUIDS[0]);
    expect(result.nodes[1].id).toBe(MOCK_UUIDS[1]);
    expect(definition.nodes[0].id).toBe('node-a');
  });

  it('应当保留节点的其他属性', () => {
    const definition: CloneableDefinition = {
      nodes: [
        createNode({
          id: 'node-a',
          type: 'mcpTool',
          position: { x: 50, y: 75 },
          data: { label: 'My Node', config: { key: 'val' } },
          width: 300,
          height: 150,
        }),
      ],
      edges: [],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.nodes[0]).toEqual({
      id: MOCK_UUIDS[0],
      type: 'mcpTool',
      position: { x: 50, y: 75 },
      data: { label: 'My Node', config: { key: 'val' } },
      width: 300,
      height: 150,
    });
  });

  it('应当更新 edge 的 source 和 target 为新节点 ID', () => {
    const definition: CloneableDefinition = {
      nodes: [createNode({ id: 'node-a' }), createNode({ id: 'node-b' })],
      edges: [createEdge({ id: 'edge-1', source: 'node-a', target: 'node-b' })],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    // node-a → MOCK_UUIDS[0], node-b → MOCK_UUIDS[1], edge → MOCK_UUIDS[2]
    expect(result.edges[0].source).toBe(MOCK_UUIDS[0]);
    expect(result.edges[0].target).toBe(MOCK_UUIDS[1]);
    expect(result.edges[0].id).toBe(MOCK_UUIDS[2]);
  });

  it('应当替换 sourceHandle 和 targetHandle 中的旧 node ID', () => {
    const definition: CloneableDefinition = {
      nodes: [createNode({ id: 'node-a' }), createNode({ id: 'node-b' })],
      edges: [
        createEdge({
          id: 'edge-1',
          source: 'node-a',
          target: 'node-b',
          sourceHandle: 'node-a-output-0',
          targetHandle: 'node-b-input-0',
        }),
      ],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.edges[0].sourceHandle).toBe(`${MOCK_UUIDS[0]}-output-0`);
    expect(result.edges[0].targetHandle).toBe(`${MOCK_UUIDS[1]}-input-0`);
  });

  it('当 sourceHandle / targetHandle 不包含节点 ID 时应保持不变', () => {
    const definition: CloneableDefinition = {
      nodes: [createNode({ id: 'node-a' }), createNode({ id: 'node-b' })],
      edges: [
        createEdge({
          id: 'edge-1',
          source: 'node-a',
          target: 'node-b',
          sourceHandle: 'output-port',
          targetHandle: 'input-port',
        }),
      ],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.edges[0].sourceHandle).toBe('output-port');
    expect(result.edges[0].targetHandle).toBe('input-port');
  });

  it('当 sourceHandle / targetHandle 为 null 时不做替换', () => {
    const definition: CloneableDefinition = {
      nodes: [createNode({ id: 'node-a' }), createNode({ id: 'node-b' })],
      edges: [
        createEdge({
          id: 'edge-1',
          source: 'node-a',
          target: 'node-b',
          sourceHandle: null,
          targetHandle: null,
        }),
      ],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.edges[0].sourceHandle).toBeNull();
    expect(result.edges[0].targetHandle).toBeNull();
  });

  it('当 sourceHandle / targetHandle 为 undefined 时不做替换', () => {
    const definition: CloneableDefinition = {
      nodes: [createNode({ id: 'node-a' }), createNode({ id: 'node-b' })],
      edges: [
        createEdge({
          id: 'edge-1',
          source: 'node-a',
          target: 'node-b',
        }),
      ],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.edges[0].sourceHandle).toBeUndefined();
    expect(result.edges[0].targetHandle).toBeUndefined();
  });

  it('当 edge 的 source/target 不在节点映射中时保留原值', () => {
    const definition: CloneableDefinition = {
      nodes: [createNode({ id: 'node-a' })],
      edges: [
        createEdge({
          id: 'edge-1',
          source: 'node-a',
          target: 'orphan-node',
        }),
      ],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.edges[0].source).toBe(MOCK_UUIDS[0]);
    expect(result.edges[0].target).toBe('orphan-node');
  });

  it('应当同步 remap compound 子节点的 parentId', () => {
    const definition: CloneableDefinition = {
      nodes: [
        createNode({ id: 'loop-root' }),
        createNode({ id: 'loop-child', parentId: 'loop-root' }),
      ],
      edges: [],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.nodes[0].id).toBe(MOCK_UUIDS[0]);
    expect(result.nodes[1].id).toBe(MOCK_UUIDS[1]);
    expect(result.nodes[1].parentId).toBe(MOCK_UUIDS[0]);
    expect(definition.nodes[1].parentId).toBe('loop-root');
  });

  it('应当兼容 legacy parent_id 并写回 canonical parentId', () => {
    const legacyChildNode = createNode({
      id: 'loop-child',
    }) as ReactFlowNode & Record<string, unknown>;
    legacyChildNode.parent_id = 'loop-root';

    const definition: CloneableDefinition = {
      nodes: [createNode({ id: 'loop-root' }), legacyChildNode],
      edges: [],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);
    const clonedChild = result.nodes[1] as ReactFlowNode &
      Record<string, unknown>;

    expect(clonedChild.parentId).toBe(MOCK_UUIDS[0]);
    expect(clonedChild.parent_id).toBeUndefined();
    expect(legacyChildNode.parent_id).toBe('loop-root');
  });

  it('应当保持 viewport 不变（深拷贝）', () => {
    const viewport: ReactFlowViewport = { x: 100, y: -50, zoom: 1.5 };
    const definition: CloneableDefinition = {
      nodes: [],
      edges: [],
      viewport,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.viewport).toEqual({ x: 100, y: -50, zoom: 1.5 });
    expect(result.viewport).not.toBe(viewport);
  });

  it('应当处理空节点和空边', () => {
    const definition: CloneableDefinition = {
      nodes: [],
      edges: [],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.viewport).toEqual(DEFAULT_VIEWPORT);
  });

  it('应当为每条 edge 分配独立的新 ID', () => {
    const definition: CloneableDefinition = {
      nodes: [
        createNode({ id: 'n1' }),
        createNode({ id: 'n2' }),
        createNode({ id: 'n3' }),
      ],
      edges: [
        createEdge({ id: 'e1', source: 'n1', target: 'n2' }),
        createEdge({ id: 'e2', source: 'n2', target: 'n3' }),
      ],
      viewport: DEFAULT_VIEWPORT,
    };

    const result = cloneDefinitionWithNewIds(definition);

    // 3 nodes + 2 edges = 5 UUIDs
    expect(result.edges[0].id).toBe(MOCK_UUIDS[3]);
    expect(result.edges[1].id).toBe(MOCK_UUIDS[4]);
    expect(result.edges[0].id).not.toBe(result.edges[1].id);
  });

  it('不应修改原始 definition 对象', () => {
    const originalNodes = [
      createNode({ id: 'node-a' }),
      createNode({ id: 'node-b' }),
    ];
    const originalEdges = [
      createEdge({ id: 'edge-1', source: 'node-a', target: 'node-b' }),
    ];
    const definition: CloneableDefinition = {
      nodes: [...originalNodes],
      edges: [...originalEdges],
      viewport: { ...DEFAULT_VIEWPORT },
    };

    cloneDefinitionWithNewIds(definition);

    expect(definition.nodes[0].id).toBe('node-a');
    expect(definition.nodes[1].id).toBe('node-b');
    expect(definition.edges[0].source).toBe('node-a');
    expect(definition.edges[0].target).toBe('node-b');
  });
});
