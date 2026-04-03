import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoopNodeBody } from './LoopNodeBody'

describe('LoopNodeBody', () => {
  it('显示循环容器摘要但不显示 state-in 提示栏', () => {
    render(
      <LoopNodeBody
        config={{
          outputMode: 'collect-array',
          isCollapsed: false,
        }}
      />,
    )

    expect(screen.getByTestId('loop-node-body')).toBeInTheDocument()
    expect(screen.getByText('循环容器')).toBeInTheDocument()
    expect(screen.getByText('输出: collect-array')).toBeInTheDocument()
    expect(screen.getByText('支持 loop-state / result')).toBeInTheDocument()
    expect(
      screen.queryByText('初始 state 优先读取 `state-in`，未连线时回退到默认值。'),
    ).not.toBeInTheDocument()
  })
})
