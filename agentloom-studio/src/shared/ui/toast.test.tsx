import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToastProvider, useToast, type ToastOptions } from './toast'

type Notify = (options: ToastOptions) => void

function renderProvider() {
  const handle: { notify: Notify | null } = { notify: null }
  function Capture() {
    handle.notify = useToast().notify
    return null
  }
  render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  )
  return (options: ToastOptions) => {
    act(() => {
      handle.notify?.(options)
    })
  }
}

describe('ToastProvider', () => {
  it('同时最多显示 3 条，超出时最早的先退场', async () => {
    const notify = renderProvider()

    for (let index = 1; index <= 6; index += 1) {
      notify({ title: `通知 ${index}`, description: `内容 ${index}` })
    }

    await waitFor(() => {
      expect(screen.queryByText('通知 3')).not.toBeInTheDocument()
    })
    expect(screen.getByText('通知 4')).toBeInTheDocument()
    expect(screen.getByText('通知 5')).toBeInTheDocument()
    expect(screen.getByText('通知 6')).toBeInTheDocument()
    expect(screen.queryByText('通知 1')).not.toBeInTheDocument()
  })

  it('同组通知合并为一条并显示次数，内容替换为最新一条', () => {
    const notify = renderProvider()

    for (let index = 1; index <= 4; index += 1) {
      notify({
        title: '执行已完成',
        description: `工作流「订单同步」第 ${index} 次`,
        groupKey: 'execution_completed:wf-1',
      })
    }
    notify({
      title: '执行已完成',
      description: '工作流「日报」',
      groupKey: 'execution_completed:wf-2',
    })

    expect(screen.getAllByText('执行已完成')).toHaveLength(2)
    expect(screen.getByText('工作流「订单同步」第 4 次')).toBeInTheDocument()
    expect(screen.queryByText('工作流「订单同步」第 1 次')).not.toBeInTheDocument()
    expect(screen.getByTestId('toast-count')).toHaveTextContent('×4')
  })
})
