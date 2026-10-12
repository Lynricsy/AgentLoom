import { describe, expect, it } from 'vitest'
import type { CanvasEdge, CanvasNode } from '../types'
import { layoutCanvasNodes } from './autoLayout'
import { buildCompoundChildExtent } from './compoundLayout'

const NODE_SIZE = { width: 240, height: 120 }

function createNode(
  id: string,
  overrides: Partial<CanvasNode> = {},
  nodeType = 'code-tool',
): CanvasNode {
  return {
    id,
    type: 'tool',
    position: { x: 0, y: 0 },
    measured: { ...NODE_SIZE },
    data: {
      label: id,
      nodeType,
      category: 'tool',
      config: {},
      inputPorts: [],
      outputPorts: [],
    },
    ...overrides,
  } as CanvasNode
}

function createEdge(source: string, target: string): CanvasEdge {
  return { id: `${source}->${target}`, source, target }
}

function rect(node: CanvasNode) {
  const width = node.measured?.width ?? NODE_SIZE.width
  const height = node.measured?.height ?? NODE_SIZE.height
  return { x: node.position.x, y: node.position.y, width, height }
}

function overlaps(a: CanvasNode, b: CanvasNode): boolean {
  const ra = rect(a)
  const rb = rect(b)
  return (
    ra.x < rb.x + rb.width &&
    rb.x < ra.x + ra.width &&
    ra.y < rb.y + rb.height &&
    rb.y < ra.y + ra.height
  )
}

function expectNoOverlap(nodes: readonly CanvasNode[]): void {
  nodes.forEach((a, i) => {
    for (const b of nodes.slice(i + 1)) {
      expect(overlaps(a, b), `${a.id} 与 ${b.id} 重叠`).toBe(false)
    }
  })
}

describe('layoutCanvasNodes', () => {
  it('把全部叠在同一点的链路按连线方向从左到右展开，并保持原左上角', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((id) =>
      createNode(id, { position: { x: 400, y: 300 } }),
    ) as [CanvasNode, CanvasNode, CanvasNode]
    const nodes = [a, b, c]

    layoutCanvasNodes(nodes, [createEdge('a', 'b'), createEdge('b', 'c')])

    expect(a.position.x).toBeLessThan(b.position.x)
    expect(b.position.x).toBeLessThan(c.position.x)
    expectNoOverlap(nodes)
    expect(Math.min(...nodes.map((n) => n.position.x))).toBe(400)
    expect(Math.min(...nodes.map((n) => n.position.y))).toBe(300)
  })

  it('多个上游汇入同一节点时上游纵向排开，下游位于其右侧', () => {
    const tools = ['t1', 't2', 't3'].map((id) => createNode(id))
    const agent = createNode('agent', {}, 'agent-main')
    const nodes = [...tools, agent]

    layoutCanvasNodes(
      nodes,
      tools.map((tool) => createEdge(tool.id, 'agent')),
    )

    expectNoOverlap(nodes)
    for (const tool of tools) {
      expect(tool.position.x + NODE_SIZE.width).toBeLessThan(agent.position.x)
    }
  })

  it('compound 容器先排内部子节点并按内容扩展尺寸，子节点留在新的 extent 内', () => {
    const upstream = createNode('upstream')
    const loop = createNode(
      'loop',
      { measured: { width: 600, height: 540 }, style: { width: 600, height: 540 } },
      'loop',
    )
    const children = ['c1', 'c2', 'c3', 'c4'].map((id) =>
      createNode(id, { parentId: 'loop' }),
    )
    const nodes = [upstream, loop, ...children]

    layoutCanvasNodes(nodes, [
      createEdge('upstream', 'c1'),
      createEdge('c1', 'c2'),
      createEdge('c2', 'c3'),
      createEdge('c3', 'c4'),
    ])

    const width = loop.style?.width as number
    const height = loop.style?.height as number
    expect(width).toBeGreaterThan(600)
    expect(loop.measured).toEqual({ width, height })

    const extent = buildCompoundChildExtent({
      inputPortCount: 0,
      outputPortCount: 0,
      width,
      height,
    })
    expectNoOverlap(children)
    for (const child of children) {
      expect(child.extent).toEqual(extent)
      expect(child.position.x).toBeGreaterThanOrEqual(extent[0][0])
      expect(child.position.y).toBeGreaterThanOrEqual(extent[0][1])
      expect(child.position.x + NODE_SIZE.width).toBeLessThanOrEqual(extent[1][0])
      expect(child.position.y + NODE_SIZE.height).toBeLessThanOrEqual(extent[1][1])
    }

    // 指向容器内部的边被提升为 upstream → loop，容器排在上游右侧
    expect(upstream.position.x + NODE_SIZE.width).toBeLessThan(loop.position.x)
    expectNoOverlap([upstream, loop].map((node) =>
      node.id === 'loop' ? { ...node, measured: { width, height } } : node,
    ))
  })

  it('收起的 compound 内部节点保持原位，只移动可见节点', () => {
    const loop = createNode(
      'loop',
      {
        position: { x: 0, y: 0 },
        data: {
          label: 'loop',
          nodeType: 'loop',
          category: 'control',
          config: { isCollapsed: true },
          inputPorts: [],
          outputPorts: [],
        },
      } as Partial<CanvasNode>,
    )
    const hiddenChild = createNode('hidden', {
      parentId: 'loop',
      position: { x: 77, y: 88 },
    })
    const after = createNode('after')

    layoutCanvasNodes([loop, hiddenChild, after], [createEdge('loop', 'after')])

    expect(hiddenChild.position).toEqual({ x: 77, y: 88 })
    expect(after.position.x).toBeGreaterThan(loop.position.x)
  })
})
