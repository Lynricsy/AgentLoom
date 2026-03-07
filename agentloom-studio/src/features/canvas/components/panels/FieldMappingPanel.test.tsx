import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasEdge, CanvasNode, FieldMapping } from '../../types'
import { createDefaultEdgeData } from '../../types'
import { FieldMappingPanel, type FieldMappingPanelProps } from './FieldMappingPanel'

function makeNode(
  id: string,
  inputPorts: CanvasNode['data']['inputPorts'] = [],
  outputPorts: CanvasNode['data']['outputPorts'] = []
): CanvasNode {
  return {
    id,
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: `Node ${id}`,
      nodeType: 'llm-agent',
      category: 'agent',
      description: undefined,
      config: {},
      inputPorts,
      outputPorts,
    },
  }
}

function makePort(
  id: string,
  label: string,
  direction: 'input' | 'output',
  dataType: 'text' | 'json' = 'text',
  required = false
) {
  const base = {
    id,
    label,
    direction,
    dataType,
    required,
    multiple: false,
    maxConnections: null,
    description: undefined,
  }
  if (dataType === 'text') {
    return { ...base, schema: { kind: 'text' as const } }
  }
  return {
    ...base,
    schema: {
      kind: 'json' as const,
      shape: 'object' as const,
      properties: {
        name: { kind: 'text' as const, title: 'Name' },
        age: { kind: 'text' as const, title: 'Age' },
      },
      required: ['name'],
    },
  }
}

function makeEdge(overrides?: Partial<CanvasEdge['data']>): CanvasEdge {
  return {
    id: 'e-1',
    source: 'src',
    target: 'tgt',
    data: {
      ...createDefaultEdgeData(),
      rawCompatibilityLevel: 'TRANSFORM',
      visualLevel: 'L1',
      ...overrides,
    },
  }
}

const sourceNode = makeNode('src', [], [
  makePort('out-text', 'Text Output', 'output', 'text'),
  makePort('out-obj', 'Object Output', 'output', 'json'),
])

const targetNode = makeNode('tgt', [
  makePort('in-text', 'Text Input', 'input', 'text', true),
  makePort('in-obj', 'Object Input', 'input', 'json'),
])

const defaultProps: FieldMappingPanelProps = {
  open: true,
  edgeId: 'e-1',
  edge: makeEdge(),
  sourceNode,
  targetNode,
  onClose: vi.fn(),
  onChange: vi.fn(),
}

describe('FieldMappingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders when open', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    expect(screen.getByTestId('field-mapping-panel')).toBeInTheDocument()
    expect(screen.getByText('字段映射')).toBeInTheDocument()
  })

  it('has aria-hidden=true when closed', () => {
    render(<FieldMappingPanel {...defaultProps} open={false} />)
    expect(screen.getByTestId('field-mapping-panel')).toHaveAttribute('aria-hidden', 'true')
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<FieldMappingPanel {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('mapping-panel-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows L0 read-only message', () => {
    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({ visualLevel: 'L0' })}
      />
    )
    expect(screen.getByText('完全匹配，无需映射')).toBeInTheDocument()
  })

  it('shows required unmapped count', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    expect(screen.getByTestId('mapping-required-summary')).toHaveTextContent(
      '2 个必填字段未映射'
    )
  })

  it('shows all-mapped message when required fields are mapped', () => {
    const edge = makeEdge({
      fieldMapping: [
        {
          sourceField: 'out-text',
          targetField: 'in-text',
          compatLevel: 'L1',
          autoRecommended: false,
        },
        {
          sourceField: 'out-obj.name',
          targetField: 'in-obj.name',
          compatLevel: 'L1',
          autoRecommended: false,
        },
      ],
    })
    render(<FieldMappingPanel {...defaultProps} edge={edge} />)
    expect(screen.getByTestId('mapping-required-summary')).toHaveTextContent(
      '所有必填字段已映射'
    )
  })

  it('flattens source output ports into field buttons', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    expect(screen.getByTestId('mapping-field-out-text')).toBeInTheDocument()
    expect(screen.getByTestId('mapping-field-out-obj.name')).toBeInTheDocument()
    expect(screen.getByTestId('mapping-field-out-obj.age')).toBeInTheDocument()
  })

  it('flattens target input ports into field buttons', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    expect(screen.getByTestId('mapping-field-in-text')).toBeInTheDocument()
    expect(screen.getByTestId('mapping-field-in-obj.name')).toBeInTheDocument()
    expect(screen.getByTestId('mapping-field-in-obj.age')).toBeInTheDocument()
  })

  it('creates mapping via click-click', () => {
    const onChange = vi.fn()
    render(<FieldMappingPanel {...defaultProps} onChange={onChange} />)

    fireEvent.click(screen.getByTestId('mapping-field-out-text'))
    fireEvent.click(screen.getByTestId('mapping-field-in-text'))

    expect(onChange).toHaveBeenCalledWith('e-1', [
      {
        sourceField: 'out-text',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: false,
      },
    ])
  })

  it('toggles source selection on repeated click', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    const sourceBtn = screen.getByTestId('mapping-field-out-text')

    fireEvent.click(sourceBtn)
    expect(sourceBtn).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(sourceBtn)
    expect(sourceBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('replaces existing mapping for same target', () => {
    const existingMappings: FieldMapping[] = [
      {
        sourceField: 'out-text',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: true,
      },
    ]
    const onChange = vi.fn()
    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({ fieldMapping: existingMappings })}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByTestId('mapping-field-out-obj.name'))
    fireEvent.click(screen.getByTestId('mapping-field-in-text'))

    expect(onChange).toHaveBeenCalledWith('e-1', [
      {
        sourceField: 'out-obj.name',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: false,
      },
    ])
  })

  it('removes mapping when delete button clicked', () => {
    const existingMappings: FieldMapping[] = [
      {
        sourceField: 'out-text',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: false,
      },
    ]
    const onChange = vi.fn()
    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({ fieldMapping: existingMappings })}
        onChange={onChange}
      />
    )

    const removeBtn = screen.getByLabelText('删除 Text Input 映射')
    fireEvent.click(removeBtn)

    expect(onChange).toHaveBeenCalledWith('e-1', [])
  })

  it('shows mapping lines for existing mappings', () => {
    const existingMappings: FieldMapping[] = [
      {
        sourceField: 'out-text',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: false,
      },
    ]
    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({ fieldMapping: existingMappings })}
      />
    )

    const panel = screen.getByTestId('field-mapping-panel')
    expect(within(panel).getByText('out-text')).toBeInTheDocument()
    expect(within(panel).getByText('→')).toBeInTheDocument()
    expect(within(panel).getByText('in-text')).toBeInTheDocument()
  })

  it('does not show mapping body in L0 readonly mode', () => {
    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({ visualLevel: 'L0' })}
      />
    )
    expect(screen.queryByTestId('mapping-field-out-text')).not.toBeInTheDocument()
  })

  it('disables target buttons when no source is selected', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    const targetBtn = screen.getByTestId('mapping-field-in-text')
    expect(targetBtn).toBeDisabled()
  })

  it('enables target buttons after source is selected', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    fireEvent.click(screen.getByTestId('mapping-field-out-text'))
    const targetBtn = screen.getByTestId('mapping-field-in-text')
    expect(targetBtn).not.toBeDisabled()
  })

  it('shows auto-recommended mapping line with correct class', () => {
    const mappings: FieldMapping[] = [
      {
        sourceField: 'out-text',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: true,
      },
    ]
    const { container } = render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({ fieldMapping: mappings })}
      />
    )
    const autoLine = container.querySelector('.mapping-line--auto')
    expect(autoLine).toBeInTheDocument()
  })
})
