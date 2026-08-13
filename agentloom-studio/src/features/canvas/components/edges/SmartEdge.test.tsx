import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Position } from '@xyflow/react'
import { SmartEdge } from './SmartEdge'
import { createDefaultEdgeData, type CanvasEdgeData } from '../../types'

const mockOnEdgesChange = vi.fn()
const mockOpenFieldMapping = vi.fn()

/** ReactFlow store 里的节点端口定义（渐变配色的唯一数据来源） */
const { nodeLookup, executionState } = vi.hoisted(() => ({
  nodeLookup: new Map<string, { data: unknown }>(),
  executionState: { nodes: {} as Record<string, { status: string }> },
}))

vi.mock('../../stores/canvasStore', () => ({
  useCanvasActions: () => ({
    onEdgesChange: mockOnEdgesChange,
    openFieldMapping: mockOpenFieldMapping,
  }),
}))

vi.mock('@/features/execution/stores/executionStore', () => ({
  useExecutionStore: (selector: (state: typeof executionState) => unknown) =>
    selector(executionState),
}))

vi.mock('@xyflow/react', () => ({
  BaseEdge: ({
    id,
    path,
    className,
    interactionWidth: _interactionWidth,
    ...rest
  }: {
    id?: string
    path?: string
    className?: string
    [key: string]: unknown
  }) => (
    <path
      data-testid={`base-edge-${id}`}
      d={path}
      className={className}
      {...rest}
    />
  ),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <foreignObject data-testid="edge-label-renderer" x="0" y="0" width="160" height="80">
      {children}
    </foreignObject>
  ),
  getBezierPath: () => ['M 0,0 C 50,0 50,100 100,100', 50, 50, 0, 0],
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useStore: (selector: (state: { nodeLookup: typeof nodeLookup }) => unknown) =>
    selector({ nodeLookup }),
}))

vi.mock('lucide-react', () => ({
  X: ({ size }: { size: number }) => (
    <svg data-testid="x-icon" width={size} height={size} />
  ),
  Shuffle: ({ size }: { size: number }) => (
    <svg data-testid="shuffle-icon" width={size} height={size} />
  ),
}))

const baseProps = {
  id: 'edge-1',
  source: 'node-a',
  target: 'node-b',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  sourceHandleId: 'text-out',
  targetHandleId: 'text-in',
  selected: false,
  data: createDefaultEdgeData(),
}

function seedTypedPorts(sourceType: string, targetType: string) {
  nodeLookup.set('node-a', {
    data: { outputPorts: [{ id: 'text-out', dataType: sourceType }] },
  })
  nodeLookup.set('node-b', {
    data: { inputPorts: [{ id: 'text-in', dataType: targetType }] },
  })
}

function renderSmartEdge(props?: Partial<typeof baseProps>) {
  return render(
    <svg aria-label="SmartEdge test canvas">
      <title>SmartEdge test canvas</title>
      <SmartEdge {...baseProps} {...props} />
    </svg>
  )
}

describe('SmartEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nodeLookup.clear()
    executionState.nodes = {}
  })

  function readClassName(element: Element): string {
    return element.getAttribute('class') ?? ''
  }

  it('renders edge with default L0 visual level', () => {
    renderSmartEdge()

    const basePath = screen.getByTestId('edge-node-a-node-b')
    expect(basePath).toBeInTheDocument()
    expect(readClassName(basePath)).toContain('smart-edge-path--l0')
    expect(readClassName(basePath)).not.toContain('smart-edge-path--selected')
  })

  it('applies selected class when selected', () => {
    renderSmartEdge({ selected: true })

    const basePath = screen.getByTestId('edge-node-a-node-b')
    expect(readClassName(basePath)).toContain('smart-edge-path--selected')
  })

  it('paints a source→target type gradient when both port types resolve', () => {
    seedTypedPorts('text', 'json')
    const { container } = renderSmartEdge()

    const gradient = container.querySelector('#edge-gradient-edge-1')
    expect(gradient).not.toBeNull()
    expect(gradient?.getAttribute('gradientUnits')).toBe('userSpaceOnUse')

    const stops = gradient!.querySelectorAll('stop')
    expect(stops).toHaveLength(2)
    expect(stops[0]!.getAttribute('stop-color')).toBe('var(--color-type-text)')
    expect(stops[1]!.getAttribute('stop-color')).toBe('var(--color-type-json)')

    const basePath = screen.getByTestId('edge-node-a-node-b')
    expect(basePath.style.getPropertyValue('--edge-stroke')).toBe(
      'url(#edge-gradient-edge-1)',
    )
  })

  it('falls back to the primary token when port types cannot be resolved', () => {
    const { container } = renderSmartEdge()

    expect(container.querySelector('#edge-gradient-edge-1')).toBeNull()
    const basePath = screen.getByTestId('edge-node-a-node-b')
    expect(basePath.style.getPropertyValue('--edge-stroke')).toBe(
      'var(--color-primary)',
    )
  })

  it('uses the single resolved port color when only one side is known', () => {
    nodeLookup.set('node-a', {
      data: { outputPorts: [{ id: 'text-out', dataType: 'image' }] },
    })
    const { container } = renderSmartEdge()

    expect(container.querySelector('#edge-gradient-edge-1')).toBeNull()
    const basePath = screen.getByTestId('edge-node-a-node-b')
    expect(basePath.style.getPropertyValue('--edge-stroke')).toBe(
      'var(--color-type-image)',
    )
  })

  it('does not render particles on an idle edge', () => {
    seedTypedPorts('text', 'text')
    const { container } = renderSmartEdge()

    expect(
      container.querySelectorAll('.smart-edge-particle--running'),
    ).toHaveLength(0)
  })

  it('renders particles while the target node is running', () => {
    seedTypedPorts('text', 'text')
    executionState.nodes = {
      'node-b': { status: 'running' },
    }
    const { container } = renderSmartEdge()

    const particles = container.querySelectorAll('.smart-edge-particle--running')
    expect(particles).toHaveLength(2)
    expect(readClassName(particles[0]!)).toContain('smart-edge-particle--l0')
  })

  it('renders particles for L1 while running', () => {
    const l1Data: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'L1',
      rawCompatibilityLevel: 'TRANSFORM',
    }
    executionState.nodes = { 'node-b': { status: 'running' } }
    const { container } = renderSmartEdge({ data: l1Data })

    const particles = container.querySelectorAll('.smart-edge-particle--running')
    expect(particles).toHaveLength(2)
    expect(readClassName(particles[0]!)).toContain('smart-edge-particle--l1')
  })

  it('does not render particles for checking level', () => {
    const checkingData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'checking',
    }
    executionState.nodes = { 'node-b': { status: 'running' } }
    const { container } = renderSmartEdge({ data: checkingData })

    const particles = container.querySelectorAll('.smart-edge-particle--running')
    expect(particles).toHaveLength(0)
  })

  it('does not render particles for error level', () => {
    const errorData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'error',
      rawCompatibilityLevel: 'INCOMPATIBLE',
    }
    executionState.nodes = { 'node-b': { status: 'running' } }
    const { container } = renderSmartEdge({ data: errorData })

    const particles = container.querySelectorAll('.smart-edge-particle--running')
    expect(particles).toHaveLength(0)
  })

  it('does not render particles in readonly preview even when the editor is running', () => {
    seedTypedPorts('text', 'text')
    executionState.nodes = { 'node-b': { status: 'running' } }
    const { container } = renderSmartEdge({
      data: { ...createDefaultEdgeData(), readonlyPreview: true },
    })

    expect(
      container.querySelectorAll('.smart-edge-particle--running'),
    ).toHaveLength(0)
  })

  it('shows level label on badge by default', () => {
    renderSmartEdge()

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.textContent).toContain('精确匹配')
  })

  it('shows mapping count when mappingSummary has data', () => {
    const mappedData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      mappingSummary: {
        autoMatchedCount: 3,
        manualCount: 1,
        requiredUnmappedCount: 0,
      },
    }
    renderSmartEdge({ data: mappedData })

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.textContent).toContain('4 已映射')
  })

  it('renders a persistent transform pill for L1 edges', () => {
    const l1Data: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'L1',
      rawCompatibilityLevel: 'TRANSFORM',
    }
    renderSmartEdge({ data: l1Data })

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.className).toContain('edge-badge--l1')
    expect(badge.className).toContain('edge-badge--visible')
    expect(badge.textContent).toContain('转换')
    expect(screen.getByTestId('shuffle-icon')).toBeInTheDocument()
  })

  it('L1 pill still opens the field mapping panel', () => {
    const l1Data: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'L1',
      rawCompatibilityLevel: 'TRANSFORM',
    }
    renderSmartEdge({ data: l1Data })

    fireEvent.click(screen.getByTestId('edge-badge-action-edge-1'))

    expect(mockOpenFieldMapping).toHaveBeenCalledWith('edge-1')
  })

  it('renders a persistent error pill for incompatible edges', () => {
    const errorData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'error',
      rawCompatibilityLevel: 'INCOMPATIBLE',
    }
    renderSmartEdge({ data: errorData })

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.className).toContain('edge-badge--error')
    expect(badge.className).toContain('edge-badge--visible')
  })

  it('delete button only exists while the edge is selected', () => {
    const { rerender } = renderSmartEdge()
    expect(screen.queryByTestId('edge-delete-edge-1')).toBeNull()

    rerender(
      <svg aria-label="SmartEdge test canvas">
        <title>SmartEdge test canvas</title>
        <SmartEdge {...baseProps} selected />
      </svg>
    )
    expect(screen.getByTestId('edge-delete-edge-1')).toBeInTheDocument()
  })

  it('delete button dispatches remove edge change', () => {
    renderSmartEdge({ selected: true })

    const deleteBtn = screen.getByTestId('edge-delete-edge-1')
    fireEvent.click(deleteBtn)

    expect(mockOnEdgesChange).toHaveBeenCalledWith([
      { type: 'remove', id: 'edge-1' },
    ])
  })

  it('click badge action opens field mapping', () => {
    renderSmartEdge()

    const badgeAction = screen.getByTestId('edge-badge-action-edge-1')
    fireEvent.mouseEnter(screen.getByTestId('edge-node-a-node-b'))
    fireEvent.click(badgeAction)

    expect(mockOpenFieldMapping).toHaveBeenCalledWith('edge-1')
  })

  it('badge is visible when edge is selected', () => {
    renderSmartEdge({ selected: true })

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.className).toContain('edge-badge--visible')
  })

  it('renders checking visual level with correct classes', () => {
    const checkingData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'checking',
    }
    renderSmartEdge({ data: checkingData })

    const basePath = screen.getByTestId('edge-node-a-node-b')
    expect(readClassName(basePath)).toContain('smart-edge-path--checking')

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.textContent).toContain('检查中...')
  })

  it('badge becomes visible on hover', () => {
    renderSmartEdge()

    const interactionPath = screen.getByTestId('edge-node-a-node-b')
    const badge = screen.getByTestId('edge-badge-edge-1')
    const badgeAction = screen.getByTestId('edge-badge-action-edge-1')

    expect(badge.className).not.toContain('edge-badge--visible')
    expect(badge).toHaveStyle({ pointerEvents: 'none' })
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(badgeAction).toHaveAttribute('tabindex', '-1')

    fireEvent.mouseEnter(interactionPath)
    expect(badge.className).toContain('edge-badge--visible')
    expect(badge).toHaveStyle({ pointerEvents: 'all' })
    expect(badge).toHaveAttribute('aria-hidden', 'false')
    expect(badgeAction).toHaveAttribute('tabindex', '0')

    fireEvent.mouseLeave(interactionPath)
    expect(badge.className).not.toContain('edge-badge--visible')
    expect(badge).toHaveStyle({ pointerEvents: 'none' })
  })

  it('shows warning indicator when requiredUnmappedCount > 0', () => {
    const warningData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'L1',
      rawCompatibilityLevel: 'TRANSFORM',
      mappingSummary: {
        autoMatchedCount: 1,
        manualCount: 0,
        requiredUnmappedCount: 2,
      },
    }
    renderSmartEdge({ data: warningData })

    const warning = screen.getByTestId('edge-warning-edge-1')
    expect(warning).toBeInTheDocument()
    expect(warning.textContent).toBe('⚠')
    expect(warning).toHaveAttribute('title', '2 个必填字段未映射')
  })

  it('shows error label with reason key', () => {
    const errorData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'error',
      rawCompatibilityLevel: 'INCOMPATIBLE',
      reasonKey: 'type_mismatch',
    }
    renderSmartEdge({ data: errorData })

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.textContent).toContain('不兼容: type_mismatch')
  })
})
