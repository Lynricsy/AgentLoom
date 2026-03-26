import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasEdge, CanvasNode, FieldMapping } from '../../types'
import type { PortDataType, TypeSchema } from '../../types/typeSchema'
import { createDefaultEdgeData } from '../../types'
import { FieldMappingPanel, type FieldMappingPanelProps } from './FieldMappingPanel'

const { mockSaveMappingSnapshot, mockUndoFieldMapping, mockNotify } = vi.hoisted(() => ({
  mockSaveMappingSnapshot: vi.fn(),
  mockUndoFieldMapping: vi.fn(),
  mockNotify: vi.fn(),
}))

vi.mock('../../stores/canvasStore', () => ({
  useCanvasStore: (selector: (state: { actions: { saveMappingSnapshot: typeof mockSaveMappingSnapshot; undoFieldMapping: typeof mockUndoFieldMapping } }) => unknown) =>
    selector({
      actions: {
        saveMappingSnapshot: mockSaveMappingSnapshot,
        undoFieldMapping: mockUndoFieldMapping,
      },
    }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}))

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function makeScalarSchema(kind: Exclude<PortDataType, 'json'>): TypeSchema {
  return { kind }
}

function makeObjectSchema(properties: Record<string, TypeSchema>, required: string[] = []): TypeSchema {
  return {
    kind: 'json',
    shape: 'object',
    properties,
    required,
  }
}

function makeDepthCappedObjectSchema(): TypeSchema {
  return makeObjectSchema({
    level1: makeObjectSchema({
      level2: makeObjectSchema({
        level3: makeObjectSchema({
          level4: makeObjectSchema({
            level5: makeObjectSchema({ value: makeScalarSchema('text') }),
          }),
        }),
      }),
    }),
  })
}

function makePort(
  id: string,
  label: string,
  direction: 'input' | 'output',
  schema: TypeSchema,
  required = false,
) {
  return {
    id,
    label,
    direction,
    dataType: schema.kind,
    required,
    multiple: false,
    maxConnections: null,
    description: undefined,
    schema,
  }
}

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
      nodeType: 'chat-agent',
      category: 'agent',
      description: undefined,
      config: {},
      inputPorts,
      outputPorts,
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

function renderPanel(overrides?: Partial<FieldMappingPanelProps>) {
  const sourceNode =
    overrides?.sourceNode ??
    makeNode('src', [], [
      makePort('out-text', 'Text Output', 'output', makeScalarSchema('text')),
      makePort(
        'out-obj',
        'Object Output',
        'output',
        makeObjectSchema({
          name: makeScalarSchema('text'),
          age: makeScalarSchema('text'),
        }),
      ),
    ])

  const targetNode =
    overrides?.targetNode ??
    makeNode('tgt', [
      makePort('in-text', 'Text Input', 'input', makeScalarSchema('text'), true),
      makePort(
        'in-obj',
        'Object Input',
        'input',
        makeObjectSchema({
          name: makeScalarSchema('text'),
          age: makeScalarSchema('text'),
        }),
      ),
    ])

  const props: FieldMappingPanelProps = {
    open: true,
    edgeId: 'e-1',
    edge: makeEdge(),
    sourceNode,
    targetNode,
    onClose: vi.fn(),
    onChange: vi.fn(),
    ...overrides,
  }

  return render(<FieldMappingPanel {...props} />)
}

async function expandPath(path: string) {
  const user = userEvent.setup()
  const segments = path.split('.')
  let currentPath = segments.shift() ?? ''

  while (segments.length > 0) {
    await user.click(screen.getByTestId(`toggle-nested-field-${currentPath}`))
    currentPath = `${currentPath}.${segments.shift()}`
  }
}

describe('FieldMappingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders panel and required summary', () => {
    renderPanel({
      edge: makeEdge({
        missingFields: [
          { path: 'in-text', expectedType: makeScalarSchema('text'), required: true },
        ],
      }),
    })

    expect(screen.getByTestId('field-mapping-panel')).toBeInTheDocument()
    expect(screen.getByTestId('mapping-required-summary')).toHaveTextContent(
      '1 个必填字段未映射',
    )
  })

  it('creates an exact mapping on click-click and saves a snapshot', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderPanel({ onChange })

    await user.click(screen.getByTestId('nested-field-out-text'))
    await user.click(screen.getByTestId('nested-field-in-text'))

    expect(mockSaveMappingSnapshot).toHaveBeenCalledWith('e-1')
    expect(onChange).toHaveBeenCalledWith('e-1', [
      {
        sourceField: 'out-text',
        targetField: 'in-text',
        compatLevel: 'L1',
        autoRecommended: false,
      },
    ])
  })

  it('marks incompatible targets as forbidden and rejects the mapping with a toast', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const sourceNode = makeNode('src', [], [
      makePort('out-image', 'Avatar', 'output', makeScalarSchema('image')),
    ])
    const targetNode = makeNode('tgt', [
      makePort('in-text', 'Caption', 'input', makeScalarSchema('text')),
    ])

    renderPanel({ sourceNode, targetNode, onChange })

    await user.click(screen.getByTestId('nested-field-out-image'))
    const target = screen.getByTestId('nested-field-in-text')
    expect(target.className).toContain('mapping-field--forbidden')

    await user.click(target)

    expect(onChange).not.toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
        description: '字段类型不兼容，且没有可用转换策略',
      }),
    )
  })

  it('opens pending coercion for coercible mappings and applies the confirmed config', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const sourceNode = makeNode('src', [], [
      makePort('out-text', 'Payload Text', 'output', makeScalarSchema('text')),
    ])
    const targetNode = makeNode('tgt', [
      makePort('in-payload', 'Payload', 'input', makeDepthCappedObjectSchema()),
    ])
    const targetLeafPath = 'in-payload.level1.level2.level3.level4.level5'

    renderPanel({ sourceNode, targetNode, onChange })

    await expandPath(targetLeafPath)
    await user.click(screen.getByTestId('nested-field-out-text'))
    await user.click(screen.getByTestId(`nested-field-${targetLeafPath}`))

    expect(screen.getByTestId('pending-coercion')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('coercion-confirm-btn'))

    expect(mockSaveMappingSnapshot).toHaveBeenCalledWith('e-1')
    expect(onChange).toHaveBeenCalledWith('e-1', [
      {
        sourceField: 'out-text',
        targetField: targetLeafPath,
        compatLevel: 'L1',
        autoRecommended: false,
        coercionConfig: { strategy: 'JSON.parse' },
      },
    ])
  })

  it('rolls back the snapshot when pending coercion is cancelled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const sourceNode = makeNode('src', [], [
      makePort('out-text', 'Payload Text', 'output', makeScalarSchema('text')),
    ])
    const targetNode = makeNode('tgt', [
      makePort('in-payload', 'Payload', 'input', makeDepthCappedObjectSchema()),
    ])
    const targetLeafPath = 'in-payload.level1.level2.level3.level4.level5'

    renderPanel({ sourceNode, targetNode, onChange })

    await expandPath(targetLeafPath)
    await user.click(screen.getByTestId('nested-field-out-text'))
    await user.click(screen.getByTestId(`nested-field-${targetLeafPath}`))
    await user.click(screen.getByTestId('coercion-cancel-btn'))

    expect(onChange).not.toHaveBeenCalled()
    expect(mockUndoFieldMapping).toHaveBeenCalledWith('e-1')
  })

  it('shows batch preview with order fallback and unmatched sources, then confirms mappings', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const sourceNode = makeNode('src', [], [
      makePort('alpha', 'Alpha', 'output', makeScalarSchema('text')),
      makePort('beta', 'Beta', 'output', makeScalarSchema('text')),
      makePort('gamma', 'Gamma', 'output', makeScalarSchema('text')),
    ])
    const targetNode = makeNode('tgt', [
      makePort('alpha', 'Alpha', 'input', makeScalarSchema('text')),
      makePort('delta', 'Delta', 'input', makeScalarSchema('text')),
    ])
    const dataTransfer = {
      effectAllowed: 'all',
      dropEffect: 'move',
      getData: vi.fn(() => 'alpha'),
      setData: vi.fn(),
    }

    renderPanel({ sourceNode, targetNode, onChange })

    const [sourceAlpha, targetAlpha] = screen.getAllByTestId('nested-field-alpha')
    if (!sourceAlpha || !targetAlpha) {
      throw new Error('Expected both source and target alpha fields')
    }

    await user.click(sourceAlpha)
    await user.keyboard('{Control>}')
    await user.click(screen.getByTestId('nested-field-beta'))
    await user.click(screen.getByTestId('nested-field-gamma'))
    await user.keyboard('{/Control}')

    fireEvent.dragStart(sourceAlpha, { dataTransfer })
    fireEvent.drop(targetAlpha, { dataTransfer })

    expect(screen.getByTestId('batch-preview')).toBeInTheDocument()
    expect(screen.getByTestId('batch-preview-item-alpha')).toHaveTextContent('精确')
    expect(screen.getByTestId('batch-preview-item-delta')).toHaveTextContent('序号')
    expect(screen.getByTestId('batch-preview-unmatched')).toHaveTextContent('gamma')

    await user.click(screen.getByTestId('batch-preview-confirm'))

    expect(mockSaveMappingSnapshot).toHaveBeenCalledWith('e-1')
    expect(onChange).toHaveBeenCalledWith('e-1', [
      {
        sourceField: 'alpha',
        targetField: 'alpha',
        compatLevel: 'L1',
        autoRecommended: false,
      },
      {
        sourceField: 'beta',
        targetField: 'delta',
        compatLevel: 'L1',
        autoRecommended: false,
      },
    ])
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'success',
        description: expect.stringContaining('1 个未匹配'),
      }),
    )
  })

  it('shows apply-all confirmation summary and skips incompatible suggestions', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const sourceNode = makeNode('src', [], [
      makePort('title', 'Title', 'output', makeScalarSchema('text')),
      makePort('avatar', 'Avatar', 'output', makeScalarSchema('image')),
    ])
    const targetNode = makeNode('tgt', [
      makePort('title', 'Title', 'input', makeScalarSchema('text')),
      makePort('avatar', 'Avatar', 'input', makeScalarSchema('text')),
    ])

    renderPanel({ sourceNode, targetNode, onChange })

    await user.click(screen.getByTestId('apply-all-suggestions'))

    expect(screen.getByTestId('apply-all-confirm')).toHaveTextContent('1 个不兼容已跳过')

    await user.click(screen.getByTestId('apply-all-confirm-btn'))

    expect(onChange).toHaveBeenCalledWith('e-1', [
      {
        sourceField: 'title',
        targetField: 'title',
        compatLevel: 'L1',
        autoRecommended: false,
        confidence: 1,
      },
    ])
  })

  it('renders coercion badge and strategy label for mismatched mappings', () => {
    const sourceNode = makeNode('src', [], [
      makePort('out-text', 'Payload Text', 'output', makeScalarSchema('text')),
    ])
    const targetNode = makeNode('tgt', [
      makePort('in-payload', 'Payload', 'input', makeDepthCappedObjectSchema()),
    ])
    const targetLeafPath = 'in-payload.level1.level2.level3.level4.level5'
    const fieldMapping: FieldMapping[] = [
      {
        sourceField: 'out-text',
        targetField: targetLeafPath,
        compatLevel: 'L1',
        autoRecommended: false,
        coercionConfig: { strategy: 'JSON.parse' },
      },
    ]

    renderPanel({
      sourceNode,
      targetNode,
      edge: makeEdge({ fieldMapping }),
    })

    expect(screen.getByTestId(`mapping-line-coercion-${targetLeafPath}`)).toHaveTextContent(
      'JSON Parse',
    )
  })

  it('supports Ctrl+Z undo shortcut', async () => {
    const user = userEvent.setup()

    renderPanel()
    await user.keyboard('{Control>}z{/Control}')

    expect(mockUndoFieldMapping).toHaveBeenCalledWith('e-1')
  })
})
