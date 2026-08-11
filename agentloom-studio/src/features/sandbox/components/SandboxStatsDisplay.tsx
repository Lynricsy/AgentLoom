import { memo } from "react";
import {
  formatSandboxBytes,
  formatSandboxMegabytes,
  getSandboxDiskPercent,
  safeSandboxPercent,
} from "../lib/sandboxStats";
import type { SandboxStats } from "../types";

interface SandboxStatsDisplayProps {
  stats: SandboxStats;
  compact?: boolean;
}

/** 水位配色：<70% 正常、70~90% 预警、>=90% 危险 */
function getBarTone(percent: number): string {
  if (percent >= 90) return "var(--color-error)";
  if (percent >= 70) return "var(--color-warning)";
  return "var(--color-success)";
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${clamped}%`, backgroundColor: getBarTone(clamped) }}
      />
    </div>
  );
}

export const SandboxStatsDisplay = memo(function SandboxStatsDisplay({
  stats,
  compact = false,
}: SandboxStatsDisplayProps) {
  const cpuPercent = safeSandboxPercent(stats.cpuPercent);
  const memPercent =
    stats.memoryLimitMb > 0
      ? safeSandboxPercent((stats.memoryUsageMb / stats.memoryLimitMb) * 100)
      : 0;
  const diskPercent = getSandboxDiskPercent(stats);

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div>
          <div className="mb-0.5 flex items-center justify-between text-[10px]">
            <span className="text-muted">CPU</span>
            <span className="font-medium tabular-nums">{cpuPercent}%</span>
          </div>
          <ProgressBar percent={cpuPercent} />
        </div>
        <div>
          <div className="mb-0.5 flex items-center justify-between text-[10px]">
            <span className="text-muted">MEM</span>
            <span className="font-medium tabular-nums">{memPercent}%</span>
          </div>
          <ProgressBar percent={memPercent} />
        </div>
        {diskPercent !== null && (
          <div>
            <div className="mb-0.5 flex items-center justify-between text-[10px]">
              <span className="text-muted">DISK</span>
              <span className="font-medium tabular-nums">{diskPercent}%</span>
            </div>
            <ProgressBar percent={diskPercent} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* CPU */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted">CPU</span>
          <span className="font-medium tabular-nums text-foreground">
            {cpuPercent}%
          </span>
        </div>
        <ProgressBar percent={cpuPercent} />
      </div>

      {/* Memory */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted">内存</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatSandboxMegabytes(stats.memoryUsageMb)} /{" "}
            {formatSandboxMegabytes(stats.memoryLimitMb)}
            <span className="ml-1 text-muted">({memPercent}%)</span>
          </span>
        </div>
        <ProgressBar percent={memPercent} />
      </div>

      {/* Disk */}
      {stats.diskUsage != null &&
        stats.diskTotal != null &&
        diskPercent !== null && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted">磁盘</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatSandboxBytes(stats.diskUsage)} /{" "}
                {formatSandboxBytes(stats.diskTotal)}
                <span className="ml-1 text-muted">({diskPercent}%)</span>
              </span>
            </div>
            <ProgressBar percent={diskPercent} />
          </div>
        )}
    </div>
  );
});
