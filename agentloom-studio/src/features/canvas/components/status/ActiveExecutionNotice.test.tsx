import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/toast'
import { ActiveExecutionNotice } from './ActiveExecutionNotice'

const mocks = vi.hoisted(() => ({
  executionId: null as string | null,
  status: null as string | null,
  isActive: false,
  progress: { completedSteps: 0, totalSteps: 0 },
  mutate: vi.fn(),
  isPending: false,
}))

vi.mock('@/features/execution', () => ({
  useExecutionId: () => mocks.executionId,
  useExecutionStatus: () => mocks.status,
  useIsExecutionActive: () => mocks.isActive,
  useExecutionProgress: () => mocks.progress,
  useCancelExecution: () => ({ mutate: mocks.mutate, isPending: mocks.isPending }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string
    params: { executionId: string }
    children: ReactNode
  }) => (
    <a href={to.replace('$executionId', params.executionId)} {...props}>
      {children}
    </a>
  ),
}))

function renderNotice() {
  return render(
    <ToastProvider>
      <ActiveExecutionNotice />
    </ToastProvider>,
  )
}

describe('ActiveExecutionNotice', () => {
  beforeEach(() => {
    mocks.executionId = null
    mocks.status = null
    mocks.isActive = false
    mocks.progress = { completedSteps: 0, totalSteps: 0 }
    mocks.mutate.mockReset()
    mocks.isPending = false
  })

  it('没有未结束的执行时不显示', () => {
    mocks.executionId = 'exec-done-0001'
    mocks.status = 'completed'
    renderNotice()

    expect(screen.queryByTestId('active-execution-notice')).not.toBeInTheDocument()
  })

  it('暂停的执行显示状态、进度与执行页链接', () => {
    mocks.executionId = '01a15508-6e7b-7073-8dbd-6b2313295b7a'
    mocks.status = 'paused'
    mocks.isActive = true
    mocks.progress = { completedSteps: 2, totalSteps: 4 }
    renderNotice()

    const notice = screen.getByTestId('active-execution-notice')
    expect(notice).toHaveTextContent('已暂停')
    expect(notice).toHaveTextContent('(2/4)')
    expect(notice).toHaveTextContent('结束前无法再次运行')
    expect(screen.getByTestId('active-execution-link')).toHaveAttribute(
      'href',
      '/executions/01a15508-6e7b-7073-8dbd-6b2313295b7a',
    )
    expect(screen.getByTestId('active-execution-link')).toHaveTextContent('#01a15508')
  })

  it('确认后通过取消执行 API 取消该执行', async () => {
    const user = userEvent.setup()
    mocks.executionId = 'exec-paused-0001'
    mocks.status = 'paused'
    mocks.isActive = true
    renderNotice()

    await user.click(screen.getByTestId('btn-cancel-active-execution'))
    expect(mocks.mutate).not.toHaveBeenCalled()

    const dialog = await screen.findByTestId('cancel-active-execution-dialog')
    expect(dialog).toHaveTextContent('取消执行 #exec-pau？')
    await user.click(screen.getByTestId('confirm-cancel-active-execution'))

    expect(mocks.mutate).toHaveBeenCalledWith(
      { executionId: 'exec-paused-0001' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('选择保留执行时不取消', async () => {
    const user = userEvent.setup()
    mocks.executionId = 'exec-running-0001'
    mocks.status = 'running'
    mocks.isActive = true
    renderNotice()

    await user.click(screen.getByTestId('btn-cancel-active-execution'))
    await user.click(await screen.findByRole('button', { name: '保留执行' }))

    await waitFor(() => {
      expect(screen.queryByTestId('cancel-active-execution-dialog')).not.toBeInTheDocument()
    })
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('取消失败时提示错误', async () => {
    const user = userEvent.setup()
    mocks.executionId = 'exec-paused-0002'
    mocks.status = 'paused'
    mocks.isActive = true
    mocks.mutate.mockImplementation((_vars, options: { onError: (error: Error) => void }) => {
      options.onError(new Error('执行已结束，无法取消'))
    })
    renderNotice()

    await user.click(screen.getByTestId('btn-cancel-active-execution'))
    await user.click(await screen.findByTestId('confirm-cancel-active-execution'))

    expect(await screen.findByText('取消执行失败')).toBeInTheDocument()
    expect(screen.getByText('执行已结束，无法取消')).toBeInTheDocument()
  })
})
