import { memo } from 'react'
import {
  formatSandboxBytes,
  formatSandboxMegabytes,
  getSandboxDiskPercent,
  safeSandboxPercent,
} from '../lib/sandboxStats'
import type { SandboxStats } from '../types'

interface SandboxStatsDisplayProps {
  stats: SandboxStats
  compact?: boolean
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    <div className="h-2 rounded-full bg-muted">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

function getBarColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export const SandboxStatsDisplay = memo(function SandboxStatsDisplay({
  stats,
  compact = false,
}: SandboxStatsDisplayProps) {
  const cpuPercent = safeSandboxPercent(stats.cpuPercent)
  const memPercent = stats.memoryLimitMb > 0
    ? safeSandboxPercent((stats.memoryUsageMb / stats.memoryLimitMb) * 100)
    : 0
  const diskPercent = getSandboxDiskPercent(stats)

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div>
          <div className="mb-0.5 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">CPU</span>
            <span className="font-medium">{cpuPercent}%</span>
          </div>
          <ProgressBar percent={cpuPercent} color={getBarColor(cpuPercent)} />
        </div>
        <div>
          <div className="mb-0.5 flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">MEM</span>
            <span className="font-medium">{memPercent}%</span>
          </div>
          <ProgressBar percent={memPercent} color={getBarColor(memPercent)} />
        </div>
        {diskPercent !== null && (
          <div>
            <div className="mb-0.5 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">DISK</span>
              <span className="font-medium">{diskPercent}%</span>
            </div>
            <ProgressBar percent={diskPercent} color={getBarColor(diskPercent)} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* CPU */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">CPU</span>
          <span className="font-medium text-foreground">{cpuPercent}%</span>
        </div>
        <ProgressBar percent={cpuPercent} color={getBarColor(cpuPercent)} />
      </div>

      {/* Memory */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">内存</span>
            <span className="font-medium text-foreground">
            {formatSandboxMegabytes(stats.memoryUsageMb)} / {formatSandboxMegabytes(stats.memoryLimitMb)}
            <span className="ml-1 text-muted-foreground">({memPercent}%)</span>
          </span>
        </div>
        <ProgressBar percent={memPercent} color={getBarColor(memPercent)} />
      </div>

      {/* Disk */}
      {stats.diskUsage != null && stats.diskTotal != null && diskPercent !== null && (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">磁盘</span>
            <span className="font-medium text-foreground">
              {formatSandboxBytes(stats.diskUsage)} / {formatSandboxBytes(stats.diskTotal)}
              <span className="ml-1 text-muted-foreground">({diskPercent}%)</span>
            </span>
          </div>
          <ProgressBar percent={diskPercent} color={getBarColor(diskPercent)} />
        </div>
      )}
    </div>
  )
})
