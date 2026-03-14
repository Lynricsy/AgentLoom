import { describe, expect, it } from 'vitest'
import type { PortDefinition, TypeSchema } from '../types'
import {
  MAX_NESTED_DEPTH,
  buildNestedFieldTree,
  collectLeafPaths,
} from './nestedFieldTree'

function expectDefined<T>(value: T | undefined, message = 'Expected value to be defined'): T {
  expect(value).toBeDefined()
  if (value === undefined) {
    throw new Error(message)
  }
  return value
}

function makePort(
  id: string,
  label: string,
  dataType: string,
  required: boolean,
  schema: TypeSchema,
): PortDefinition {
  return {
    id,
    label,
    direction: 'input',
    dataType: dataType as PortDefinition['dataType'],
    required,
    multiple: false,
    maxConnections: 1,
    schema,
  }
}

describe('buildNestedFieldTree', () => {
  it('creates leaf node for scalar port', () => {
    const ports = [
      makePort('name', 'Name', 'text', true, { kind: 'text' }),
    ]
    const tree = buildNestedFieldTree(ports)
    const root = expectDefined(tree[0])

    expect(tree).toHaveLength(1)
    expect(root).toMatchObject({
      path: 'name',
      leafKey: 'Name',
      depth: 0,
      isLeaf: true,
      isMapped: false,
      required: true,
    })
    expect(root.children).toBeUndefined()
  })

  it('expands object schema into child nodes', () => {
    const schema: TypeSchema = {
      kind: 'json',
      shape: 'object',
      properties: {
        firstName: { kind: 'text' },
        age: { kind: 'json', shape: 'object', properties: {} },
      },
      required: ['firstName'],
    }
    const ports = [makePort('user', 'User', 'json', false, schema)]
    const tree = buildNestedFieldTree(ports)
    const root = expectDefined(tree[0])
    const children = expectDefined(root.children)

    expect(tree).toHaveLength(1)
    expect(root.isLeaf).toBe(false)
    expect(children).toHaveLength(2)

    const firstNameChild = expectDefined(children[0], 'Expected firstName child')
    expect(firstNameChild).toMatchObject({
      path: 'user.firstName',
      leafKey: 'firstName',
      depth: 1,
      isLeaf: true,
      required: true,
    })

    const ageChild = expectDefined(children[1], 'Expected age child')
    expect(ageChild).toMatchObject({
      path: 'user.age',
      leafKey: 'age',
      depth: 1,
      isLeaf: false,
    })
    expect(ageChild.children).toEqual([])
  })

  it('creates virtual [*] node for array schema', () => {
    const schema: TypeSchema = {
      kind: 'json',
      shape: 'array',
      items: { kind: 'text' },
    }
    const ports = [makePort('tags', 'Tags', 'json', false, schema)]
    const tree = buildNestedFieldTree(ports)
    const root = expectDefined(tree[0])
    const children = expectDefined(root.children)

    expect(tree).toHaveLength(1)
    expect(root.isLeaf).toBe(false)
    expect(children).toHaveLength(1)

    const virtualNode = expectDefined(children[0], 'Expected virtual array node')
    expect(virtualNode).toMatchObject({
      path: 'tags[*]',
      leafKey: 'items[*]',
      depth: 1,
      isLeaf: true,
    })
  })

  it('handles nested array of objects', () => {
    const schema: TypeSchema = {
      kind: 'json',
      shape: 'array',
      items: {
        kind: 'json',
        shape: 'object',
        properties: {
          id: { kind: 'text' },
          value: { kind: 'json', shape: 'object', properties: {} },
        },
      },
    }
    const ports = [makePort('items', 'Items', 'json', false, schema)]
    const tree = buildNestedFieldTree(ports)
    const root = expectDefined(tree[0])
    const children = expectDefined(root.children)

    const virtualNode = expectDefined(children[0], 'Expected virtual array node')
    const virtualChildren = expectDefined(virtualNode.children)
    expect(virtualNode.path).toBe('items[*]')
    expect(virtualNode.isLeaf).toBe(false)
    expect(virtualChildren).toHaveLength(2)
    expect(expectDefined(virtualChildren[0], 'Expected first nested child').path).toBe('items[*].id')
    expect(expectDefined(virtualChildren[0], 'Expected first nested child').depth).toBe(2)
  })

  it('marks mapped paths', () => {
    const schema: TypeSchema = {
      kind: 'json',
      shape: 'object',
      properties: {
        name: { kind: 'text' },
        email: { kind: 'text' },
      },
    }
    const ports = [makePort('contact', 'Contact', 'json', false, schema)]
    const mapped = new Set(['contact.name'])
    const tree = buildNestedFieldTree(ports, mapped)
    const root = expectDefined(tree[0])
    const children = expectDefined(root.children)

    expect(root.isMapped).toBe(false)
    expect(expectDefined(children[0], 'Expected mapped child').isMapped).toBe(true)
    expect(expectDefined(children[1], 'Expected unmapped child').isMapped).toBe(false)
  })

  it('caps depth at MAX_NESTED_DEPTH', () => {
    let schema: TypeSchema = { kind: 'text' }
    for (let i = MAX_NESTED_DEPTH + 2; i > 0; i--) {
      schema = {
        kind: 'json',
        shape: 'object',
        properties: { nested: schema },
      }
    }
    const ports = [makePort('deep', 'Deep', 'json', false, schema)]
    const tree = buildNestedFieldTree(ports)

    let node = expectDefined(tree[0])
    let maxDepth = 0
    while (node.children && node.children.length > 0) {
      node = expectDefined(node.children[0], 'Expected nested child while traversing tree')
      maxDepth = Math.max(maxDepth, node.depth)
    }
    expect(maxDepth).toBe(MAX_NESTED_DEPTH)
    expect(node.isLeaf).toBe(true)
  })

  it('returns empty array for no ports', () => {
    expect(buildNestedFieldTree([])).toEqual([])
  })

  it('handles multiple ports', () => {
    const ports = [
      makePort('input1', 'Input 1', 'text', true, { kind: 'text' }),
      makePort('input2', 'Input 2', 'json', false, {
        kind: 'json',
        shape: 'object',
        properties: { x: { kind: 'text' } },
      }),
    ]
    const tree = buildNestedFieldTree(ports)
    const firstNode = expectDefined(tree[0])
    const secondNode = expectDefined(tree[1])
    const secondChildren = expectDefined(secondNode.children)

    expect(tree).toHaveLength(2)
    expect(firstNode.isLeaf).toBe(true)
    expect(secondNode.isLeaf).toBe(false)
    expect(secondChildren).toHaveLength(1)
  })
})

describe('collectLeafPaths', () => {
  it('collects all leaf paths from tree', () => {
    const schema: TypeSchema = {
      kind: 'json',
      shape: 'object',
      properties: {
        name: { kind: 'text' },
        age: { kind: 'text' },
      },
    }
    const ports = [
      makePort('data', 'Data', 'json', false, schema),
      makePort('flag', 'Flag', 'text', false, { kind: 'text' }),
    ]
    const tree = buildNestedFieldTree(ports)
    const paths = collectLeafPaths(tree)

    expect(paths).toEqual(['data.name', 'data.age', 'flag'])
  })

  it('returns empty array for empty tree', () => {
    expect(collectLeafPaths([])).toEqual([])
  })

  it('includes virtual array item paths', () => {
    const schema: TypeSchema = {
      kind: 'json',
      shape: 'array',
      items: { kind: 'text' },
    }
    const ports = [makePort('list', 'List', 'json', false, schema)]
    const tree = buildNestedFieldTree(ports)
    const paths = collectLeafPaths(tree)

    expect(paths).toEqual(['list[*]'])
  })
})
