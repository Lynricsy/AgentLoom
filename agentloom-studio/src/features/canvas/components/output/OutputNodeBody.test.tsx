import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileText } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeExecutionState } from '@/features/execution'
import { OutputNodeBody } from './OutputNodeBody'
import { PreviewModeContext } from '../PreviewModeContext'

const mocks = vi.hoisted(() => ({
  nodeState: null as NodeExecutionState | null,
}))

vi.mock('@/features/execution', () => ({
  useNodeExecutionState: () => mocks.nodeState,
}))

describe('OutputNodeBody', () => {
  beforeEach(() => {
    mocks.nodeState = {
      stepId: 'step-1',
      nodeId: 'node-1',
      status: 'completed',
      output: '# 详情标题\n\n```ts\nconst answer = 42\n```',
      isStreaming: false,
      toolCalls: {},
      agentEvents: [],
      subAgentStreams: {},
    }
  })

  it('opens the detail dialog from the preview card', async () => {
    const user = userEvent.setup()

    render(
      <OutputNodeBody
        nodeId="node-1"
        format="markdown"
        icon={FileText}
        title="文本输出"
        detailDescription="支持 Markdown 详情查看"
      />,
    )

    await user.click(screen.getByTestId('output-node-body-trigger'))

    expect(screen.getByTestId('node-output-detail-dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '详情标题' })).toBeInTheDocument()
    expect(screen.getByText(/const answer = 42/)).toBeInTheDocument()
  })

  it('预览态不显示编辑器执行输出', () => {
    render(
      <PreviewModeContext.Provider value={{ edges: [], lodOverride: null }}>
        <OutputNodeBody
          nodeId="node-1"
          format="markdown"
          icon={FileText}
          title="文本输出"
          detailDescription="支持 Markdown 详情查看"
        />
      </PreviewModeContext.Provider>,
    )

    expect(screen.queryByText(/const answer = 42/)).not.toBeInTheDocument()
    expect(
      screen.getByText('暂无输出，运行后可在这里查看详情'),
    ).toBeInTheDocument()
  })
})
