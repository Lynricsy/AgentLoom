import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FailedNodeError } from './FailedNodeError'

describe('FailedNodeError', () => {
  it('渲染 RFC 7807 格式错误', () => {
    const rfc7807 = JSON.stringify({
      title: 'Rate Limit Exceeded',
      detail: 'Too many requests in 60 seconds',
      type: 'https://api.example.com/errors/rate-limit',
      nodeId: 'node-http-1',
    })

    render(<FailedNodeError errorMessage={rfc7807} />)
    const error = screen.getByTestId('failed-node-error')
    expect(error).toHaveTextContent('Rate Limit Exceeded')
    expect(error).toHaveTextContent('Too many requests in 60 seconds')
  })

  it('渲染非 RFC 纯文本错误', () => {
    render(<FailedNodeError errorMessage="Connection timed out" />)
    const error = screen.getByTestId('failed-node-error')
    expect(error).toHaveTextContent('Connection timed out')
  })

  it('RFC 7807 缺少 title 时使用默认标题', () => {
    const rfc7807 = JSON.stringify({
      detail: 'Something went wrong',
    })

    render(<FailedNodeError errorMessage={rfc7807} />)
    const error = screen.getByTestId('failed-node-error')
    expect(error).toHaveTextContent('执行失败')
    expect(error).toHaveTextContent('Something went wrong')
  })

  it('null errorMessage 不渲染', () => {
    const { container } = render(<FailedNodeError errorMessage={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('空字符串 errorMessage 不渲染', () => {
    const { container } = render(<FailedNodeError errorMessage="" />)
    expect(container.firstChild).toBeNull()
  })
})
