import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { formatClockTime } from '../../lib/presentation'

import { TimelineIO } from './TimelineIO'

describe('TimelineIO', () => {
  it('渲染输入输出预览、耗时与重试摘要', () => {
    render(
      <TimelineIO
        input={{ prompt: 'hello', metadata: { language: 'zh-CN' } }}
        output={{ answer: 'world' }}
        startedAt="2026-01-01T00:00:00Z"
        completedAt="2026-01-01T00:01:05Z"
        retryCount={2}
      />,
    )

    expect(screen.getByTestId('timeline-io-input-preview')).toHaveTextContent(
      '输入预览',
    )
    expect(screen.getByTestId('timeline-io-output-preview')).toHaveTextContent(
      '输出预览',
    )
    expect(screen.getByTestId('timeline-io-duration')).toHaveTextContent('1m 5s')
    expect(screen.getByText('重试 2 次')).toBeInTheDocument()
  })

  it('展开后渲染结构化 JSON 与 timing meta', () => {
    render(
      <TimelineIO
        input={{ prompt: 'hello', context: ['a', 'b'] }}
        output={{ answer: 'world', score: 0.9 }}
        startedAt="2026-01-01T00:00:00Z"
        completedAt="2026-01-01T00:00:05Z"
        retryCount={1}
      />,
    )

    fireEvent.click(screen.getByTestId('timeline-io-toggle'))

    expect(screen.getByTestId('timeline-io-expanded')).toBeInTheDocument()
    expect(screen.getByText('prompt:')).toBeInTheDocument()
    expect(screen.getByText('answer:')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-io-meta')).toHaveTextContent(
      `开始：${formatClockTime('2026-01-01T00:00:00Z')}`,
    )
    expect(screen.getByTestId('timeline-io-meta')).toHaveTextContent(
      `结束：${formatClockTime('2026-01-01T00:00:05Z')}`,
    )
    expect(screen.getByTestId('timeline-io-meta')).toHaveTextContent('耗时：5s')
    expect(screen.getByTestId('timeline-io-meta')).toHaveTextContent('重试：1 次')
  })
})
