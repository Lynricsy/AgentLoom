import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SandboxComputerPanel } from './SandboxComputerPanel'

vi.mock('../api/conversationQueries', () => ({
  useConversationSandboxStats: vi.fn(() => ({
    data: {
      cpuPercent: 18.4,
      memoryUsageMb: 128,
      memoryLimitMb: 512,
      diskUsage: 0,
      diskTotal: 2 * 1024 * 1024 * 1024,
    },
  })),
}))

describe('SandboxComputerPanel', () => {
  it('应显示会话沙箱的实际 CPU、内存和磁盘值', () => {
    render(
      <SandboxComputerPanel
        conversationId="conv-1"
        agentName="测试 Agent"
        terminalEntries={[]}
        fileChanges={[]}
        sandboxStatus="running"
      />,
    )

    expect(screen.getByText('18.4%')).toBeInTheDocument()
    expect(screen.getByText('128 MB / 512 MB')).toBeInTheDocument()
    expect(screen.getByText('0 B / 2.0 GB')).toBeInTheDocument()
  })
})
