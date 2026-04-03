import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SandboxStatsDisplay } from './SandboxStatsDisplay'

describe('SandboxStatsDisplay', () => {
  it('按 MB 合同渲染内存用量，避免出现 NaN', () => {
    render(
      <SandboxStatsDisplay
        stats={{
          cpuPercent: 12.34,
          memoryUsageMb: 180,
          memoryLimitMb: 512,
        }}
      />,
    )

    expect(screen.getByText('180 MB / 512 MB')).toBeInTheDocument()
    expect(screen.getByText('(35.16%)')).toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })

  it('磁盘占用为 0 时也应显示真实值，而不是当成缺失字段', () => {
    render(
      <SandboxStatsDisplay
        stats={{
          cpuPercent: 3,
          memoryUsageMb: 64,
          memoryLimitMb: 512,
          diskUsage: 0,
          diskTotal: 2 * 1024 * 1024 * 1024,
        }}
      />,
    )

    expect(screen.getByText('0 B / 2.0 GB')).toBeInTheDocument()
    expect(screen.getByText('(0%)')).toBeInTheDocument()
  })
})
