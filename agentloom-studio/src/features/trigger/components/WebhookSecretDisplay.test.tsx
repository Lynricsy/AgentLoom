import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WebhookSecretDisplay } from './WebhookSecretDisplay'

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}))

describe('WebhookSecretDisplay', () => {
  it('signed 模式按服务端算法说明签名：时间戳头 + `{timestamp}.{body}` 签名串', () => {
    render(<WebhookSecretDisplay token="tok-1" secret="sec-1" authMode="signed" />)

    const guide = screen.getByTestId('webhook-signature-guide')
    expect(guide).toHaveTextContent('X-AgentLoom-Timestamp')
    expect(guide).toHaveTextContent('X-AgentLoom-Signature')
    expect(guide).toHaveTextContent('{timestamp}.{原始请求体}')
    expect(guide).toHaveTextContent('300 秒')
    // 示例脚本按 `${TS}.${BODY}` 计算签名，并同时携带两个请求头
    expect(guide).toHaveTextContent(`printf '%s' "$TS.$BODY"`)
    expect(guide).toHaveTextContent('-H "X-AgentLoom-Timestamp: $TS"')
    expect(guide).toHaveTextContent('/webhooks/tok-1')
    expect(screen.queryByText(/服务端会使用 secret 对请求体/)).not.toBeInTheDocument()
  })

  it('simple 模式说明无需签名，不展示签名步骤', () => {
    render(<WebhookSecretDisplay token="tok-1" secret="sec-1" authMode="simple" />)

    const guide = screen.getByTestId('webhook-signature-guide')
    expect(guide).toHaveTextContent('Simple 模式无需签名')
    expect(guide).not.toHaveTextContent('X-AgentLoom-Signature')
  })
})
