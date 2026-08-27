import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HttpToolConfigPanel } from './HttpToolConfigPanel'

function createConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    url: 'https://api.example.com/health',
    method: 'GET',
    ...overrides,
  }
}

describe('HttpToolConfigPanel', () => {
  it('renders the existing url and method', () => {
    render(<HttpToolConfigPanel config={createConfig()} onApply={vi.fn()} />)

    expect(screen.getByLabelText(/URL/)).toHaveValue(
      'https://api.example.com/health',
    )
    expect(screen.getByLabelText('Method')).toHaveTextContent('GET')
  })

  describe('failOnHttpError 开关', () => {
    it('配置里没有该字段时默认开启（非 2xx 视为失败）', () => {
      render(<HttpToolConfigPanel config={createConfig()} onApply={vi.fn()} />)

      expect(screen.getByLabelText('非 2xx 视为失败')).toBeChecked()
    })

    it('配置里显式 false 时渲染为关闭', () => {
      render(
        <HttpToolConfigPanel
          config={createConfig({ failOnHttpError: false })}
          onApply={vi.fn()}
        />,
      )

      expect(screen.getByLabelText('非 2xx 视为失败')).not.toBeChecked()
    })

    it('非布尔的脏数据按默认值 true 处理', () => {
      render(
        <HttpToolConfigPanel
          config={createConfig({ failOnHttpError: 'nope' })}
          onApply={vi.fn()}
        />,
      )

      expect(screen.getByLabelText('非 2xx 视为失败')).toBeChecked()
    })

    it('关闭开关时以 false 写回，且保留其余配置', async () => {
      const user = userEvent.setup()
      const onApply = vi.fn()

      render(
        <HttpToolConfigPanel config={createConfig()} onApply={onApply} />,
      )

      await user.click(screen.getByLabelText('非 2xx 视为失败'))

      expect(onApply).toHaveBeenCalledTimes(1)
      expect(onApply).toHaveBeenLastCalledWith({
        config: expect.objectContaining({
          url: 'https://api.example.com/health',
          method: 'GET',
          timeout: 30,
          failOnHttpError: false,
        }),
      })
    })

    it('重新开启开关时以 true 写回', async () => {
      const user = userEvent.setup()
      const onApply = vi.fn()

      render(
        <HttpToolConfigPanel
          config={createConfig({ failOnHttpError: false })}
          onApply={onApply}
        />,
      )

      await user.click(screen.getByLabelText('非 2xx 视为失败'))

      expect(onApply).toHaveBeenLastCalledWith({
        config: expect.objectContaining({ failOnHttpError: true }),
      })
    })

    it('切换开关不会破坏 URL 必填校验状态', async () => {
      const user = userEvent.setup()
      const onValidationChange = vi.fn()

      render(
        <HttpToolConfigPanel
          config={createConfig({ url: '' })}
          onApply={vi.fn()}
          onValidationChange={onValidationChange}
        />,
      )

      await user.click(screen.getByLabelText('非 2xx 视为失败'))

      expect(onValidationChange).toHaveBeenLastCalledWith(true)
    })
  })
})
