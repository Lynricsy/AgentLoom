import { describe, expect, it } from 'vitest'
import type { CanvasEdge, CanvasNode, NodeCategory } from '../types'
import { validateDag } from './dagValidator'

function createNode(id: string, label = `Node ${id}`, category: NodeCategory = 'agent'): CanvasNode {
  return {
    id,
    type: category,
    position: { x: 0, y: 0 },
    data: {
      label,
      nodeType: 'llm-agent',
      category,
      config: {},
      inputPorts: [{ id: 'in', label: 'Input', dataType: 'text' }],
      outputPorts: [{ id: 'out', label: 'Output', dataType: 'text' }],
    },
  }
}

function createEdge(source: string, target: string, id?: string): CanvasEdge {
  return {
    id: id ?? `${source}-${target}`,
    source,
    target,
    type: 'smart',
  }
}

describe('validateDag', () => {
  it('returns valid for empty graph', () => {
    const result = validateDag([], [])
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns valid for single node', () => {
    const result = validateDag([createNode('a')], [])
    expect(result.isValid).toBe(true)
  })

  it('returns valid for linear chain A → B → C', () => {
    const nodes = [createNode('a'), createNode('b'), createNode('c')]
    const edges = [createEdge('a', 'b'), createEdge('b', 'c')]
    const result = validateDag(nodes, edges)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns valid for diamond DAG', () => {
    const nodes = [createNode('a'), createNode('b'), createNode('c'), createNode('d')]
    const edges = [
      createEdge('a', 'b'),
      createEdge('a', 'c'),
      createEdge('b', 'd'),
      createEdge('c', 'd'),
    ]
    const result = validateDag(nodes, edges)
    expect(result.isValid).toBe(true)
  })

  it('detects simple cycle A → B → A', () => {
    const nodes = [createNode('a'), createNode('b')]
    const edges = [createEdge('a', 'b'), createEdge('b', 'a')]
    const result = validateDag(nodes, edges)
    expect(result.isValid).toBe(false)
    const errorTypes = result.errors.map((e) => e.type)
    expect(errorTypes).toContain('cycle')
    const cycleError = result.errors.find((e) => e.type === 'cycle')!
    expect(cycleError.nodeIds).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('detects cycle in subgraph while reporting no-start-node', () => {
    const nodes = [createNode('a'), createNode('b'), createNode('c')]
    const edges = [createEdge('a', 'b'), createEdge('b', 'c'), createEdge('c', 'a')]
    const result = validateDag(nodes, edges)
    expect(result.isValid).toBe(false)
    const errorTypes = result.errors.map((e) => e.type)
    expect(errorTypes).toContain('cycle')
    expect(errorTypes).toContain('no-start-node')
  })

  it('detects no-start-node when all nodes have incoming edges', () => {
    const nodes = [createNode('a'), createNode('b')]
    const edges = [createEdge('a', 'b'), createEdge('b', 'a')]
    const result = validateDag(nodes, edges)
    expect(result.errors.some((e) => e.type === 'no-start-node')).toBe(true)
  })

  it('warns when parallel outputs exceed limit', () => {
    const nodes = [createNode('hub', 'Hub')]
    const edges: CanvasEdge[] = []
    for (let i = 0; i < 12; i++) {
      const targetId = `t${i}`
      nodes.push(createNode(targetId))
      edges.push(createEdge('hub', targetId))
    }
    const result = validateDag(nodes, edges, 10)
    expect(result.isValid).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.type).toBe('parallel-limit-exceeded')
    expect(result.warnings[0]!.nodeId).toBe('hub')
    expect(result.warnings[0]!.currentCount).toBe(12)
    expect(result.warnings[0]!.limit).toBe(10)
  })

  it('does not warn when parallel outputs are within limit', () => {
    const nodes = [createNode('hub')]
    const edges: CanvasEdge[] = []
    for (let i = 0; i < 5; i++) {
      const targetId = `t${i}`
      nodes.push(createNode(targetId))
      edges.push(createEdge('hub', targetId))
    }
    const result = validateDag(nodes, edges, 10)
    expect(result.warnings).toHaveLength(0)
  })

  it('supports custom parallel limit', () => {
    const nodes = [createNode('hub')]
    const edges: CanvasEdge[] = []
    for (let i = 0; i < 4; i++) {
      const targetId = `t${i}`
      nodes.push(createNode(targetId))
      edges.push(createEdge('hub', targetId))
    }
    const result = validateDag(nodes, edges, 3)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.limit).toBe(3)
  })

  it('returns both errors and warnings when applicable', () => {
    const nodes = [createNode('a'), createNode('b')]
    const edges: CanvasEdge[] = [createEdge('a', 'b'), createEdge('b', 'a')]
    for (let i = 0; i < 12; i++) {
      const targetId = `t${i}`
      nodes.push(createNode(targetId))
      edges.push(createEdge('a', targetId))
    }
    const result = validateDag(nodes, edges, 10)
    expect(result.isValid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
