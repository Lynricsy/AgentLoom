import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { NestedFieldNode, TypeSchema } from '../../types'
import { NestedFieldTree } from './NestedFieldTree'

afterEach(cleanup)

function makeLeaf(path: string, leafKey: string, opts?: Partial<NestedFieldNode>): NestedFieldNode {
  return {
    path,
    leafKey,
    schema: { kind: 'text' } as TypeSchema,
    required: false,
    depth: 0,
    isExpanded: false,
    isLeaf: true,
    isMapped: false,
    ...opts,
  }
}

function makeParent(
  path: string,
  leafKey: string,
  children: NestedFieldNode[],
  opts?: Partial<NestedFieldNode>,
): NestedFieldNode {
  return {
    path,
    leafKey,
    schema: { kind: 'json', shape: 'object', properties: {} } as TypeSchema,
    required: false,
    depth: 0,
    isExpanded: false,
    isLeaf: false,
    isMapped: false,
    children,
    ...opts,
  }
}

describe('NestedFieldTree', () => {
  it('renders leaf nodes', () => {
    const nodes = [makeLeaf('name', 'name')]
    render(
      <NestedFieldTree
        nodes={nodes}
        selectedPaths={new Set()}
        onFieldClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('nested-field-name')).toBeInTheDocument()
    expect(screen.getByText('name')).toBeInTheDocument()
  })

  it('renders parent nodes collapsed by default', () => {
    const parent = makeParent('user', 'user', [
      makeLeaf('user.name', 'name', { depth: 1 }),
    ])
    render(
      <NestedFieldTree
        nodes={[parent]}
        selectedPaths={new Set()}
        onFieldClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('nested-field-user')).toBeInTheDocument()
    expect(screen.queryByTestId('nested-field-user.name')).not.toBeInTheDocument()
  })

  it('expands parent node on chevron click', () => {
    const parent = makeParent('user', 'user', [
      makeLeaf('user.name', 'name', { depth: 1 }),
    ])
    render(
      <NestedFieldTree
        nodes={[parent]}
        selectedPaths={new Set()}
        onFieldClick={vi.fn()}
      />,
    )

    const chevron = screen.getByTestId('toggle-nested-field-user')
    fireEvent.click(chevron)
    expect(screen.getByTestId('nested-field-user.name')).toBeInTheDocument()
  })

  it('collapses parent node on second chevron click', () => {
    const parent = makeParent('user', 'user', [
      makeLeaf('user.name', 'name', { depth: 1 }),
    ])
    render(
      <NestedFieldTree
        nodes={[parent]}
        selectedPaths={new Set()}
        onFieldClick={vi.fn()}
      />,
    )

    const chevron = screen.getByTestId('toggle-nested-field-user')
    fireEvent.click(chevron)
    expect(screen.getByTestId('nested-field-user.name')).toBeInTheDocument()

    fireEvent.click(chevron)
    expect(screen.queryByTestId('nested-field-user.name')).not.toBeInTheDocument()
  })

  it('calls onFieldClick for leaf click', () => {
    const onFieldClick = vi.fn()
    const nodes = [makeLeaf('name', 'name')]
    render(
      <NestedFieldTree
        nodes={nodes}
        selectedPaths={new Set()}
        onFieldClick={onFieldClick}
      />,
    )
    fireEvent.click(screen.getByTestId('nested-field-name'))
    expect(onFieldClick).toHaveBeenCalledWith('name')
  })

  it('does not call onFieldClick for parent node click', () => {
    const onFieldClick = vi.fn()
    const parent = makeParent('user', 'user', [
      makeLeaf('user.name', 'name', { depth: 1 }),
    ])
    render(
      <NestedFieldTree
        nodes={[parent]}
        selectedPaths={new Set()}
        onFieldClick={onFieldClick}
      />,
    )
    fireEvent.click(screen.getByTestId('nested-field-user'))
    expect(onFieldClick).not.toHaveBeenCalled()
  })

  it('highlights selected paths', () => {
    const nodes = [
      makeLeaf('name', 'name'),
      makeLeaf('email', 'email'),
    ]
    const { container } = render(
      <NestedFieldTree
        nodes={nodes}
        selectedPaths={new Set(['name'])}
        onFieldClick={vi.fn()}
      />,
    )
    const nameEl = screen.getByTestId('nested-field-name')
    expect(nameEl.className).toContain('selected')
  })

  it('shows mapped indicator on mapped fields', () => {
    const nodes = [makeLeaf('name', 'name', { isMapped: true })]
    render(
      <NestedFieldTree
        nodes={nodes}
        selectedPaths={new Set()}
        onFieldClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('mapped-indicator-name')).toBeInTheDocument()
  })

  it('renders required indicator', () => {
    const nodes = [makeLeaf('name', 'name', { required: true })]
    render(
      <NestedFieldTree
        nodes={nodes}
        selectedPaths={new Set()}
        onFieldClick={vi.fn()}
      />,
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('applies indentation by depth', () => {
    const child = makeLeaf('user.name', 'name', { depth: 2 })
    const parent = makeParent('user', 'user', [child])
    render(
      <NestedFieldTree
        nodes={[parent]}
        selectedPaths={new Set()}
        onFieldClick={vi.fn()}
      />,
    )

    const chevron = screen.getByTestId('toggle-nested-field-user')
    fireEvent.click(chevron)

    const childRow = screen.getByTestId('nested-field-user.name')
    expect(childRow.style.paddingLeft).toBe('32px')
  })

  it('shows depth cap indicator at max depth', () => {
    const deepChild = makeParent('deep.child', 'child', [
      makeLeaf('deep.child.inner', 'inner', { depth: 6 }),
    ], { depth: 5 })
    const deepNode = makeParent('deep', 'deep', [deepChild], { depth: 4 })
    render(
      <NestedFieldTree
        nodes={[deepNode]}
        selectedPaths={new Set()}
        onFieldClick={vi.fn()}
      />,
    )

    const chevron = screen.getByTestId('toggle-nested-field-deep')
    fireEvent.click(chevron)

    expect(screen.getByText('…')).toBeInTheDocument()
  })

  it('supports drag events on leaf nodes', () => {
    const onDragStart = vi.fn()
    const nodes = [makeLeaf('name', 'name')]
    render(
      <NestedFieldTree
        nodes={nodes}
        selectedPaths={new Set()}
        onFieldClick={vi.fn()}
        onFieldDragStart={onDragStart}
      />,
    )

    const field = screen.getByTestId('nested-field-name')
    fireEvent.dragStart(field)
    expect(onDragStart).toHaveBeenCalledWith('name')
  })
})
