import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Position } from '@xyflow/react'
import { SmartEdge } from './SmartEdge'
import { createDefaultEdgeData, type CanvasEdgeData } from '../../types'

const mockOnEdgesChange = vi.fn()
const mockOpenFieldMapping = vi.fn()

vi.mock('../../stores/canvasStore', () => ({
  useCanvasActions: () => ({
    onEdgesChange: mockOnEdgesChange,
    openFieldMapping: mockOpenFieldMapping,
  }),
}))

vi.mock('@xyflow/react', () => ({
  BaseEdge: ({
    id,
    path,
    className,
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
    <div data-testid="edge-label-renderer">{children}</div>
  ),
  getBezierPath: () => ['M 0,0 C 50,0 50,100 100,100', 50, 50, 0, 0],
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}))

vi.mock('lucide-react', () => ({
  X: ({ size }: { size: number }) => (
    <svg data-testid="x-icon" width={size} height={size} />
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
  selected: false,
  data: createDefaultEdgeData(),
}

describe('SmartEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders edge with default L0 visual level', () => {
    render(<SmartEdge {...baseProps} />)

    const basePath = screen.getByTestId('edge-node-a-node-b')
    expect(basePath).toBeInTheDocument()
    expect(basePath.className).toContain('smart-edge-path--l0')
    expect(basePath.className).not.toContain('smart-edge-path--selected')
  })

  it('applies selected class when selected', () => {
    render(<SmartEdge {...baseProps} selected />)

    const basePath = screen.getByTestId('edge-node-a-node-b')
    expect(basePath.className).toContain('smart-edge-path--selected')
  })

  it('renders particles for L0 visual level', () => {
    const { container } = render(<SmartEdge {...baseProps} />)

    const particles = container.querySelectorAll('.smart-edge-particle--running')
    expect(particles).toHaveLength(2)
    expect(particles[0]!.className).toContain('smart-edge-particle--l0')
  })

  it('renders particles for L1 visual level', () => {
    const l1Data: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'L1',
      rawCompatibilityLevel: 'TRANSFORM',
    }
    const { container } = render(<SmartEdge {...baseProps} data={l1Data} />)

    const particles = container.querySelectorAll('.smart-edge-particle--running')
    expect(particles).toHaveLength(2)
    expect(particles[0]!.className).toContain('smart-edge-particle--l1')
  })

  it('does not render particles for checking level', () => {
    const checkingData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'checking',
    }
    const { container } = render(
      <SmartEdge {...baseProps} data={checkingData} />
    )

    const particles = container.querySelectorAll('.smart-edge-particle--running')
    expect(particles).toHaveLength(0)
  })

  it('does not render particles for error level', () => {
    const errorData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'error',
      rawCompatibilityLevel: 'INCOMPATIBLE',
    }
    const { container } = render(
      <SmartEdge {...baseProps} data={errorData} />
    )

    const particles = container.querySelectorAll('.smart-edge-particle--running')
    expect(particles).toHaveLength(0)
  })

  it('shows level label on badge by default', () => {
    render(<SmartEdge {...baseProps} />)

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
    render(<SmartEdge {...baseProps} data={mappedData} />)

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.textContent).toContain('4 已映射')
  })

  it('delete button dispatches remove edge change', () => {
    render(<SmartEdge {...baseProps} />)

    const deleteBtn = screen.getByTestId('edge-delete-edge-1')
    fireEvent.click(deleteBtn)

    expect(mockOnEdgesChange).toHaveBeenCalledWith([
      { type: 'remove', id: 'edge-1' },
    ])
  })

  it('double-click badge opens field mapping', () => {
    render(<SmartEdge {...baseProps} />)

    const badge = screen.getByTestId('edge-badge-edge-1')
    fireEvent.doubleClick(badge)

    expect(mockOpenFieldMapping).toHaveBeenCalledWith('edge-1')
  })

  it('badge is visible when edge is selected', () => {
    render(<SmartEdge {...baseProps} selected />)

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.className).toContain('edge-badge--visible')
  })

  it('renders checking visual level with correct classes', () => {
    const checkingData: CanvasEdgeData = {
      ...createDefaultEdgeData(),
      visualLevel: 'checking',
    }
    render(<SmartEdge {...baseProps} data={checkingData} />)

    const basePath = screen.getByTestId('edge-node-a-node-b')
    expect(basePath.className).toContain('smart-edge-path--checking')

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.textContent).toContain('检查中...')
  })

  it('badge becomes visible on hover', () => {
    render(<SmartEdge {...baseProps} />)

    const interactionPath = screen.getByTestId('edge-node-a-node-b')
    const badge = screen.getByTestId('edge-badge-edge-1')

    expect(badge.className).not.toContain('edge-badge--visible')

    fireEvent.mouseEnter(interactionPath)
    expect(badge.className).toContain('edge-badge--visible')

    fireEvent.mouseLeave(interactionPath)
    expect(badge.className).not.toContain('edge-badge--visible')
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
    render(<SmartEdge {...baseProps} data={warningData} />)

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
    render(<SmartEdge {...baseProps} data={errorData} />)

    const badge = screen.getByTestId('edge-badge-edge-1')
    expect(badge.textContent).toContain('不兼容: type_mismatch')
  })
})
