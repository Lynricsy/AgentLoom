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

  it('优先使用结构化 errorDetail 渲染 RFC 7807 字段', () => {
    render(
      <FailedNodeError
        errorMessage="fallback message"
        errorDetail={{
          message: 'Structured message',
          title: 'Structured Rate Limit',
          detail: 'Structured detail',
          type: 'https://api.example.com/errors/structured-rate-limit',
          nodeId: 'node-2',
        }}
      />,
    )

    const error = screen.getByTestId('failed-node-error')
    expect(error).toHaveTextContent('Structured Rate Limit')
    expect(error).toHaveTextContent('Structured detail')
    expect(error).toHaveTextContent('https://api.example.com/errors/structured-rate-limit')
    expect(error).toHaveTextContent('node-2')
  })

  it('渲染类型不匹配 badge、字段错误与重试记录', () => {
    render(
      <FailedNodeError
        errorMessage="fallback message"
        errorDetail={{
          message: '节点输入解析失败',
          detail: 'text 无法写入 json',
          type: 'https://agentloom.dev/errors/node-type-mismatch',
          nodeId: 'node-target',
          errors: [
            { field: 'targetPortId', message: '需要 json 类型端口' },
          ],
          typeMismatch: {
            sourceNodeId: 'node-source',
            sourcePortId: 'output',
            sourceType: 'text',
            targetNodeId: 'node-target',
            targetPortId: 'input',
            targetType: 'json',
            edgeId: 'edge-1',
          },
          attempts: [
            {
              attempt: 2,
              message: '第二次重试仍失败',
              timestamp: '2026-03-10T10:05:00.000Z',
            },
          ],
        }}
      />,
    )

    const error = screen.getByTestId('failed-node-error')
    expect(error).toHaveTextContent('Type Mismatch')
    expect(error).toHaveTextContent('text')
    expect(error).toHaveTextContent('json')
    expect(error).toHaveTextContent('targetPortId')
    expect(error).toHaveTextContent('需要 json 类型端口')
    expect(error).toHaveTextContent('重试记录（1）')
  })

  it('errorMessage 为空但存在结构化 errorDetail 时仍渲染', () => {
    render(
      <FailedNodeError
        errorMessage={null}
        errorDetail={{
          message: 'Agent 执行失败',
          title: 'Agent Error',
          detail: '模型调用超时',
          type: 'https://agentloom.dev/errors/agent-execution',
        }}
      />,
    )

    expect(screen.getByTestId('failed-node-error')).toHaveTextContent('Agent Error')
    expect(screen.getByTestId('failed-node-error')).toHaveTextContent('模型调用超时')
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
