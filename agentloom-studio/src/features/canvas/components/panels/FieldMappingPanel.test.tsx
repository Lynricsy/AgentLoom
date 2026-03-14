import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasEdge, CanvasNode, FieldMapping } from '../../types'
import { createDefaultEdgeData } from '../../types'
import { FieldMappingPanel, type FieldMappingPanelProps } from './FieldMappingPanel'

const { mockSaveMappingSnapshot, mockUndoFieldMapping } = vi.hoisted(() => ({
  mockSaveMappingSnapshot: vi.fn(),
  mockUndoFieldMapping: vi.fn(),
}))

vi.mock('../../stores/canvasStore', () => ({
  useCanvasStore: (selector: (state: any) => any) =>
    selector({
      saveMappingSnapshot: mockSaveMappingSnapshot,
      undoFieldMapping: mockUndoFieldMapping,
    }),
}))

function makeNode(
  id: string,
  inputPorts: CanvasNode['data']['inputPorts'] = [],
  outputPorts: CanvasNode['data']['outputPorts'] = [],
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
  required = false,
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

const requiredMissingFields = [
  {
    path: 'in-text',
    expectedType: { kind: 'text' as const },
    required: true,
  },
  {
    path: 'in-obj.name',
    expectedType: { kind: 'text' as const },
    required: true,
  },
]

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

/** 展开源字段树的 out-obj 分组 */
function expandSourceObj() {
  fireEvent.click(screen.getByTestId('toggle-nested-field-out-obj'))
}

/** 展开目标字段树的 in-obj 分组 */
function expandTargetObj() {
  fireEvent.click(screen.getByTestId('toggle-nested-field-in-obj'))
}

describe('FieldMappingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── 基础渲染 ───

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
      />,
    )
    expect(screen.getByText('完全匹配，无需映射')).toBeInTheDocument()
  })

  // ─── 摘要统计 ───

  it('shows required unmapped count from compatibility metadata', () => {
    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({ missingFields: requiredMissingFields })}
      />,
    )
    expect(screen.getByTestId('mapping-required-summary')).toHaveTextContent(
      '2 个必填字段未映射',
    )
  })

  it('does not recompute required unmapped fields from target schema', () => {
    render(<FieldMappingPanel {...defaultProps} />)

    expect(screen.getByTestId('mapping-required-summary')).toHaveTextContent(
      '所有必填字段已映射',
    )
  })

  it('shows all-mapped message when required fields are mapped', () => {
    const edge = makeEdge({
      missingFields: requiredMissingFields,
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
      '所有必填字段已映射',
    )
  })

  // ─── 字段树渲染 ───

  it('renders source output ports as nested tree', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    expect(screen.getByTestId('nested-field-out-text')).toBeInTheDocument()
    // out-obj 是分组节点，需展开才能看到子节点
    expect(screen.queryByTestId('nested-field-out-obj.name')).not.toBeInTheDocument()
    expandSourceObj()
    expect(screen.getByTestId('nested-field-out-obj.name')).toBeInTheDocument()
    expect(screen.getByTestId('nested-field-out-obj.age')).toBeInTheDocument()
    expect(screen.getByTestId('mapping-source-summary')).toHaveTextContent('源: Node src (3)')
  })

  it('renders target input ports as nested tree', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    expect(screen.getByTestId('nested-field-in-text')).toBeInTheDocument()
    expect(screen.queryByTestId('nested-field-in-obj.name')).not.toBeInTheDocument()
    expandTargetObj()
    expect(screen.getByTestId('nested-field-in-obj.name')).toBeInTheDocument()
    expect(screen.getByTestId('nested-field-in-obj.age')).toBeInTheDocument()
    expect(screen.getByTestId('mapping-target-summary')).toHaveTextContent('目标: Node tgt (3)')
  })

  it('highlights suggested fields from auto recommendations', () => {
    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({
          candidateMappings: [
            {
              sourcePath: 'out-obj.name',
              targetPath: 'in-obj.name',
              confidence: 0.92,
              autoRecommended: true,
            },
          ],
        })}
      />,
    )

    expandSourceObj()
    expect(screen.getByTestId('nested-field-out-obj.name').className).toContain(
      'mapping-field--suggested',
    )

    expandTargetObj()
    expect(screen.getByTestId('nested-field-in-obj.name').className).toContain(
      'mapping-field--suggested',
    )
  })

  // ─── 映射操作 ───

  it('creates mapping via click-click', () => {
    const onChange = vi.fn()
    render(<FieldMappingPanel {...defaultProps} onChange={onChange} />)

    fireEvent.click(screen.getByTestId('nested-field-out-text'))
    fireEvent.click(screen.getByTestId('nested-field-in-text'))

    expect(onChange).toHaveBeenCalledWith('e-1', [
      {
        sourceField: 'out-text',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: false,
      },
    ])
  })

  it('creates mapping via drag and drop', () => {
    const onChange = vi.fn()
    const dataTransfer = {
      effectAllowed: 'uninitialized',
      dropEffect: 'none',
      getData: vi.fn(() => 'out-text'),
      setData: vi.fn(),
    }

    render(<FieldMappingPanel {...defaultProps} onChange={onChange} />)

    const sourceBtn = screen.getByTestId('nested-field-out-text')
    fireEvent.dragStart(sourceBtn, { dataTransfer })

    const targetBtn = screen.getByTestId('nested-field-in-text')
    expect(targetBtn).not.toBeDisabled()

    fireEvent.dragOver(targetBtn, { dataTransfer })
    fireEvent.drop(targetBtn, { dataTransfer })

    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'out-text')
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
    const sourceBtn = screen.getByTestId('nested-field-out-text')

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
      />,
    )

    expandSourceObj()
    fireEvent.click(screen.getByTestId('nested-field-out-obj.name'))
    fireEvent.click(screen.getByTestId('nested-field-in-text'))

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
      />,
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
    const { container } = render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({ fieldMapping: existingMappings })}
      />,
    )

    // 映射线与推荐卡都含 →，需限定在 .mapping-line 内查找
    const line = container.querySelector('.mapping-line:not(.mapping-line--auto)') as HTMLElement
    expect(line).toBeTruthy()
    expect(line).toHaveTextContent('out-text')
    expect(line).toHaveTextContent('→')
    expect(line).toHaveTextContent('in-text')
  })

  // ─── L0 只读 ───

  it('does not show mapping body in L0 readonly mode', () => {
    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({ visualLevel: 'L0' })}
      />,
    )
    expect(screen.queryByTestId('nested-field-out-text')).not.toBeInTheDocument()
  })

  // ─── 目标按钮启用/禁用 ───

  it('disables target buttons when no source is selected', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    const targetBtn = screen.getByTestId('nested-field-in-text')
    expect(targetBtn).toBeDisabled()
  })

  it('enables target buttons after source is selected', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    fireEvent.click(screen.getByTestId('nested-field-out-text'))
    const targetBtn = screen.getByTestId('nested-field-in-text')
    expect(targetBtn).not.toBeDisabled()
  })

  // ─── C4 候选映射 ───

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
      />,
    )
    const autoLine = container.querySelector('.mapping-line--auto')
    expect(autoLine).toBeInTheDocument()
  })

  it('accepts only one best candidate per target when applying all recommendations', () => {
    const onChange = vi.fn()

    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({
          candidateMappings: [
            {
              sourcePath: 'out-text',
              targetPath: 'in-text',
              confidence: 0.7,
              autoRecommended: false,
            },
            {
              sourcePath: 'out-obj.name',
              targetPath: 'in-text',
              confidence: 0.92,
              autoRecommended: true,
            },
          ],
        })}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByTestId('accept-all-candidates'))

    expect(onChange).toHaveBeenCalledWith('e-1', [
      {
        sourceField: 'out-obj.name',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: true,
        confidence: 0.92,
      },
    ])
  })

  it('prefers auto-recommended candidates even when a manual candidate has higher confidence', () => {
    const onChange = vi.fn()

    render(
      <FieldMappingPanel
        {...defaultProps}
        edge={makeEdge({
          candidateMappings: [
            {
              sourcePath: 'out-text',
              targetPath: 'in-text',
              confidence: 0.98,
              autoRecommended: false,
            },
            {
              sourcePath: 'out-obj.name',
              targetPath: 'in-text',
              confidence: 0.72,
              autoRecommended: true,
            },
          ],
        })}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByTestId('accept-all-candidates'))

    expect(onChange).toHaveBeenCalledWith('e-1', [
      {
        sourceField: 'out-obj.name',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: true,
        confidence: 0.72,
      },
    ])
  })

  // ─── L2 智能推荐 ───

  it('shows smart suggestions section for unmapped targets', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    expect(screen.getByTestId('mapping-suggestions-section')).toBeInTheDocument()
    expect(screen.getByText(/个智能推荐/)).toBeInTheDocument()
  })

  it('applies single suggestion and saves snapshot', () => {
    const onChange = vi.fn()
    render(<FieldMappingPanel {...defaultProps} onChange={onChange} />)

    fireEvent.click(screen.getByTestId('suggestion-card-in-text'))

    expect(mockSaveMappingSnapshot).toHaveBeenCalledWith('e-1')
    expect(onChange).toHaveBeenCalledWith(
      'e-1',
      expect.arrayContaining([
        expect.objectContaining({
          targetField: 'in-text',
          compatLevel: 'L1',
          autoRecommended: false,
        }),
      ]),
    )
  })

  it('applies all applicable suggestions and saves snapshot', () => {
    const onChange = vi.fn()
    render(<FieldMappingPanel {...defaultProps} onChange={onChange} />)

    fireEvent.click(screen.getByTestId('apply-all-suggestions'))

    expect(mockSaveMappingSnapshot).toHaveBeenCalledWith('e-1')
    expect(onChange).toHaveBeenCalledOnce()

    const [edgeId, mappings] = onChange.mock.calls[0]
    expect(edgeId).toBe('e-1')
    // in-text ↔ out-text Jaccard 得分 ≈0.65 低于 0.70 阈值，仅 2 个目标通过
    const targets = (mappings as FieldMapping[]).map((m) => m.targetField).sort()
    expect(targets).toEqual(['in-obj.age', 'in-obj.name'])
  })

  it('skips manually-mapped targets when applying all suggestions', () => {
    const existingManualMapping: FieldMapping[] = [
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
        edge={makeEdge({ fieldMapping: existingManualMapping })}
        onChange={onChange}
      />,
    )

    const applyAllBtn = screen.queryByTestId('apply-all-suggestions')
    if (applyAllBtn) {
      fireEvent.click(applyAllBtn)

      expect(onChange).toHaveBeenCalledOnce()
      const [, mappings] = onChange.mock.calls[0]
      const manualMapping = (mappings as FieldMapping[]).find(
        (m) => m.targetField === 'in-text',
      )
      expect(manualMapping?.sourceField).toBe('out-text')
    }
  })

  // ─── 撤销 ───

  it('calls undoFieldMapping when undo button clicked', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    fireEvent.click(screen.getByTestId('mapping-undo'))
    expect(mockUndoFieldMapping).toHaveBeenCalledWith('e-1')
  })

  // ─── 批量多选 ───

  it('supports Ctrl multi-select on source fields', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    const outText = screen.getByTestId('nested-field-out-text')

    fireEvent.click(outText)
    expect(outText).toHaveAttribute('aria-pressed', 'true')

    expandSourceObj()
    const outObjName = screen.getByTestId('nested-field-out-obj.name')

    fireEvent.keyDown(window, { key: 'Control' })
    fireEvent.click(outObjName)
    fireEvent.keyUp(window, { key: 'Control' })

    expect(outText).toHaveAttribute('aria-pressed', 'true')
    expect(outObjName).toHaveAttribute('aria-pressed', 'true')
  })

  it('deselects in multi-select mode with Ctrl+click', () => {
    render(<FieldMappingPanel {...defaultProps} />)
    const outText = screen.getByTestId('nested-field-out-text')

    fireEvent.click(outText)
    expect(outText).toHaveAttribute('aria-pressed', 'true')

    fireEvent.keyDown(window, { key: 'Control' })
    fireEvent.click(outText)
    fireEvent.keyUp(window, { key: 'Control' })

    expect(outText).toHaveAttribute('aria-pressed', 'false')
  })
})
