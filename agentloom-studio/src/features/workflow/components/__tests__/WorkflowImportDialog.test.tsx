import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Radix Dialog mock ---
vi.mock('@radix-ui/react-dialog', async () => {
  const React = await import('react')
  const { Fragment, createContext, useContext, cloneElement, isValidElement } = React

  const DialogContext = createContext<{
    onOpenChange?: (open: boolean) => void
  } | null>(null)

  function Root({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children?: React.ReactNode
  }) {
    if (!open) return null
    return React.createElement(
      DialogContext.Provider,
      { value: { onOpenChange } },
      children,
    )
  }

  function Portal({ children }: { children?: React.ReactNode }) {
    return React.createElement(Fragment, null, children)
  }
  function Overlay(props: Record<string, unknown>) {
    return React.createElement('div', props)
  }
  function Content(props: Record<string, unknown>) {
    return React.createElement('div', { role: 'dialog', ...props })
  }
  function Title(props: Record<string, unknown>) {
    return React.createElement('h2', props)
  }
  function Description(props: Record<string, unknown>) {
    return React.createElement('p', props)
  }

  type CloseChildProps = { onClick?: React.MouseEventHandler }
  function Close({
    asChild,
    children,
  }: {
    asChild?: boolean
    children?: React.ReactNode
  }) {
    const ctx = useContext(DialogContext)
    const onOpenChange = ctx?.onOpenChange
    if (asChild && isValidElement<CloseChildProps>(children)) {
      const child = children
      return cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          child.props.onClick?.(event)
          onOpenChange?.(false)
        },
      })
    }
    return React.createElement(
      'button',
      { type: 'button', onClick: () => onOpenChange?.(false) },
      children,
    )
  }

  return { Root, Portal, Overlay, Content, Title, Description, Close }
})

// --- hoisted mocks ---
const { validateMock, importMock, parseImportFileMock, navigateMock } =
  vi.hoisted(() => ({
    validateMock: {
      mutateAsync: vi.fn(),
      isPending: false,
      reset: vi.fn(),
    },
    importMock: {
      mutateAsync: vi.fn(),
      isPending: false,
      error: null as Error | null,
      reset: vi.fn(),
    },
    parseImportFileMock: vi.fn(),
    navigateMock: vi.fn(),
  }))

vi.mock('../../api/workflowMutations', () => ({
  useValidateImport: () => validateMock,
  useImportWorkflow: () => importMock,
}))

vi.mock('../../lib/workflowExportImport', () => ({
  parseImportFile: parseImportFileMock,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/shared/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

const { WorkflowImportDialog } = await import('../WorkflowImportDialog')

// --- helpers ---
const validEnvelope = {
  schema_version: 'agentloom-workflow-v1',
  exported_at: '2026-03-10T08:00:00.000Z',
  workflow: {
    name: 'My Workflow',
    description: 'A test workflow',
    definition: {
      nodes: [{ id: 'n1' }, { id: 'n2' }],
      edges: [{ id: 'e1' }],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  },
}

function simulateFileUpload(input: HTMLInputElement, content: string) {
  const file = new File([content], 'test.agentloom-workflow.json', {
    type: 'application/json',
  })
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('WorkflowImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    validateMock.mutateAsync = vi.fn()
    validateMock.isPending = false
    validateMock.reset = vi.fn()
    importMock.mutateAsync = vi.fn()
    importMock.isPending = false
    importMock.error = null
    importMock.reset = vi.fn()
    parseImportFileMock.mockReset()
  })

  it('renders upload zone in initial state', () => {
    render(<WorkflowImportDialog open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByText('导入工作流')).toBeInTheDocument()
    expect(screen.getByTestId('import-upload-zone')).toBeInTheDocument()
    expect(screen.getByTestId('import-file-input')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    render(<WorkflowImportDialog open={false} onOpenChange={vi.fn()} />)

    expect(screen.queryByText('导入工作流')).not.toBeInTheDocument()
  })

  it('shows file error when parseImportFile rejects', async () => {
    parseImportFileMock.mockRejectedValue(new Error('文件大小超出限制 (最大 10MB)'))

    render(<WorkflowImportDialog open={true} onOpenChange={vi.fn()} />)

    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    simulateFileUpload(input, 'any content')

    await waitFor(() => {
      expect(screen.getByText('文件大小超出限制 (最大 10MB)')).toBeInTheDocument()
    })
  })

  it('shows validation errors when validation fails', async () => {
    parseImportFileMock.mockResolvedValue(JSON.stringify(validEnvelope))
    validateMock.mutateAsync.mockResolvedValue({
      valid: false,
      errors: ['缺少必需的节点类型', '边引用了不存在的节点'],
    })

    render(<WorkflowImportDialog open={true} onOpenChange={vi.fn()} />)

    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    simulateFileUpload(input, JSON.stringify(validEnvelope))

    await waitFor(() => {
      expect(screen.getByText('文件校验失败')).toBeInTheDocument()
      expect(screen.getByText('缺少必需的节点类型')).toBeInTheDocument()
      expect(screen.getByText('边引用了不存在的节点')).toBeInTheDocument()
    })
  })

  it('shows preview with node/edge counts when validation succeeds', async () => {
    parseImportFileMock.mockResolvedValue(JSON.stringify(validEnvelope))
    validateMock.mutateAsync.mockResolvedValue({
      valid: true,
      nodeCount: 5,
      edgeCount: 3,
    })

    render(<WorkflowImportDialog open={true} onOpenChange={vi.fn()} />)

    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    simulateFileUpload(input, JSON.stringify(validEnvelope))

    await waitFor(() => {
      expect(screen.getByText('文件校验通过')).toBeInTheDocument()
    })

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('节点')).toBeInTheDocument()
    expect(screen.getByText('连线')).toBeInTheDocument()
    expect(screen.getByText('agentloom-workflow-v1')).toBeInTheDocument()

    const nameInput = screen.getByTestId('import-name-input') as HTMLInputElement
    expect(nameInput.value).toBe('My Workflow 的副本')
  })

  it('allows editing name and description in preview step', async () => {
    const user = userEvent.setup()
    parseImportFileMock.mockResolvedValue(JSON.stringify(validEnvelope))
    validateMock.mutateAsync.mockResolvedValue({
      valid: true,
      nodeCount: 2,
      edgeCount: 1,
    })

    render(<WorkflowImportDialog open={true} onOpenChange={vi.fn()} />)

    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    simulateFileUpload(input, JSON.stringify(validEnvelope))

    await waitFor(() => {
      expect(screen.getByTestId('import-name-input')).toBeInTheDocument()
    })

    const nameInput = screen.getByTestId('import-name-input')
    await user.clear(nameInput)
    await user.type(nameInput, 'Custom Name')
    expect(nameInput).toHaveValue('Custom Name')

    const descInput = screen.getByTestId('import-description-input')
    await user.clear(descInput)
    await user.type(descInput, 'Custom Description')
    expect(descInput).toHaveValue('Custom Description')
  })

  it('clicking import button calls importWorkflow with correct payload', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    parseImportFileMock.mockResolvedValue(JSON.stringify(validEnvelope))
    validateMock.mutateAsync.mockResolvedValue({
      valid: true,
      nodeCount: 2,
      edgeCount: 1,
    })
    importMock.mutateAsync.mockResolvedValue({
      id: 'new-wf-id',
      name: 'My Workflow 的副本',
      slug: 'my-workflow-copy',
    })

    render(<WorkflowImportDialog open={true} onOpenChange={onOpenChange} />)

    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    simulateFileUpload(input, JSON.stringify(validEnvelope))

    await waitFor(() => {
      expect(screen.getByTestId('btn-confirm-import')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('btn-confirm-import'))

    await waitFor(() => {
      expect(importMock.mutateAsync).toHaveBeenCalledWith({
        name: 'My Workflow 的副本',
        description: 'A test workflow',
        fileContent: validEnvelope,
      })
    })

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/workflows/$workflowId',
      params: { workflowId: 'new-wf-id' },
    })
  })

  it('shows importing state while mutation is pending', async () => {
    parseImportFileMock.mockResolvedValue(JSON.stringify(validEnvelope))
    validateMock.mutateAsync.mockResolvedValue({
      valid: true,
      nodeCount: 2,
      edgeCount: 1,
    })

    const { rerender } = render(
      <WorkflowImportDialog open={true} onOpenChange={vi.fn()} />,
    )

    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    simulateFileUpload(input, JSON.stringify(validEnvelope))

    await waitFor(() => {
      expect(screen.getByTestId('btn-confirm-import')).toBeInTheDocument()
    })

    importMock.isPending = true
    rerender(<WorkflowImportDialog open={true} onOpenChange={vi.fn()} />)

    const importBtn = screen.getByTestId('btn-confirm-import')
    expect(importBtn).toBeDisabled()
  })
})
