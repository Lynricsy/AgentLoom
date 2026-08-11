import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/toast'
import { ExecutionDebugView } from './ExecutionDebugView'
import type { ExecutionDetail } from '../types'

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useLiveExecutionDetailMock: vi.fn(),
  usePtySessionsMock: vi.fn(),
  sendPtyWriteMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigateMock,
}))

vi.mock('../hooks/useLiveExecutionDetail', () => ({
  useLiveExecutionDetail: (...args: unknown[]) =>
    mocks.useLiveExecutionDetailMock(...args),
}))

vi.mock('../hooks/usePtySessions', () => ({
  usePtySessions: (...args: unknown[]) => mocks.usePtySessionsMock(...args),
}))

vi.mock('../api/pty', () => ({
  sendPtyWrite: (...args: unknown[]) => mocks.sendPtyWriteMock(...args),
}))

vi.mock('./TerminalTab', () => ({
  TerminalTab: ({ activeSessionId }: { activeSessionId: string | null }) => (
    <div data-testid="mock-terminal-tab">{activeSessionId ?? 'no-session'}</div>
  ),
}))

vi.mock('./ReadonlyCanvas', () => ({
  ReadonlyCanvas: ({ selectedNodeId, onSelectNode }: { selectedNodeId: string | null; onSelectNode: (nodeId: string) => void }) => (
    <div data-testid="mock-readonly-canvas">
      <div data-testid="mock-canvas-selected">{selectedNodeId ?? 'none'}</div>
      <button type="button" onClick={() => onSelectNode('node-1')}>select node 1</button>
    </div>
  ),
}))

vi.mock('../hooks/useTimelineData', () => ({
  useTimelineData: () => ({ timelineData: [], isLoading: false }),
}))

vi.mock('./timeline', () => ({
  ExecutionTimelineVertical: ({ selectedNodeId, onSelectNode }: { selectedNodeId: string | null; onSelectNode: (nodeId: string) => void }) => (
    <div data-testid="mock-execution-timeline">
      <div data-testid="mock-timeline-selected">{selectedNodeId ?? 'none'}</div>
      <button type="button" onClick={() => onSelectNode('node-2')}>select node 2</button>
    </div>
  ),
}))

vi.mock('./ExecutionNodeDetail', () => ({
  ExecutionNodeDetail: ({ step }: { step: { nodeName: string } | null }) => (
    <div data-testid="mock-node-detail">{step?.nodeName ?? 'empty'}</div>
  ),
}))

vi.mock('./ExecutionTelemetryPanel', () => ({
  ExecutionTelemetryPanel: ({ executionId }: { executionId: string }) => (
    <div data-testid="mock-telemetry-panel">{executionId}</div>
  ),
}))

vi.mock('@/features/evidence/components/EvidenceReferencePanel', () => ({
  EvidenceReferencePanel: () => (
    <div data-testid="mock-evidence-reference-panel" />
  ),
}))

function createExecutionDetail(): ExecutionDetail {
  return {
    id: 'exec-001',
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-001',
    workflowVersionId: 'ver-001',
    status: 'running',
    triggerType: 'manual',
    inputParams: null,
    result: null,
    startedAt: '2026-03-10T10:00:00.000Z',
    completedAt: null,
    errorMessage: null,
    createdAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-10T10:00:10.000Z',
    steps: [
      {
        id: 'step-1',
        executionId: 'exec-001',
        nodeId: 'node-1',
        nodeName: 'Node One',
        nodeType: 'agent',
        status: 'completed',
        input: null,
        output: null,
        errorMessage: null,
        startedAt: '2026-03-10T10:00:00.000Z',
        completedAt: '2026-03-10T10:00:05.000Z',
        retryCount: 0,
      },
      {
        id: 'step-2',
        executionId: 'exec-001',
        nodeId: 'node-2',
        nodeName: 'Node Two',
        nodeType: 'http-tool',
        status: 'failed',
        input: null,
        output: null,
        errorMessage: 'boom',
        startedAt: '2026-03-10T10:00:05.000Z',
        completedAt: '2026-03-10T10:00:09.000Z',
        retryCount: 1,
      },
    ],
    workflowVersion: {
      id: 'ver-001',
      graph: {
        nodes: [],
        edges: [],
      },
    },
  }
}

/** 组件依赖 ToastProvider 上报执行详情加载失败 */
function renderView() {
  return render(
    <ToastProvider>
      <ExecutionDebugView executionId="exec-001" />
    </ToastProvider>,
  )
}

describe('ExecutionDebugView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useLiveExecutionDetailMock.mockReturnValue({
      data: createExecutionDetail(),
      isLoading: false,
      error: null,
    })
    mocks.usePtySessionsMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })
  })

  it('渲染三栏布局并默认选中最高优先级节点', async () => {
    renderView()
    const desktopLayout = screen.getByTestId('execution-debug-desktop-layout')

    expect(screen.getByTestId('execution-debug-left-panel')).toBeInTheDocument()
    expect(screen.getByTestId('execution-debug-center-panel')).toBeInTheDocument()
    expect(screen.getByTestId('execution-debug-right-panel')).toBeInTheDocument()

    await waitFor(() => {
      expect(within(desktopLayout).getByTestId('mock-node-detail')).toHaveTextContent('Node Two')
    })
  })

  it('节点选择在各面板间同步', async () => {
    renderView()
    const desktopLayout = screen.getByTestId('execution-debug-desktop-layout')

    await waitFor(() => {
      expect(within(desktopLayout).getByTestId('mock-canvas-selected')).toHaveTextContent('node-2')
    })

    fireEvent.click(within(desktopLayout).getByRole('button', { name: 'select node 1' }))

    expect(within(desktopLayout).getByTestId('mock-timeline-selected')).toHaveTextContent('node-1')
    expect(within(desktopLayout).getByTestId('mock-node-detail')).toHaveTextContent('Node One')
  })

  it('切换到遥测 tab 渲染遥测面板', () => {
    renderView()

    expect(screen.queryByTestId('mock-telemetry-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('execution-debug-tab-telemetry'))

    expect(screen.getByTestId('execution-debug-telemetry-tab')).toBeInTheDocument()
    expect(screen.getByTestId('mock-telemetry-panel')).toHaveTextContent('exec-001')
    expect(screen.queryByTestId('execution-debug-desktop-layout')).not.toBeInTheDocument()
  })
})
