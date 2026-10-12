import { formatBytes } from "@/shared/lib/format";
import type { SandboxStats } from "../types";

/** 沙箱内存指标以 MB 为单位上报，统一换算为字节后走 formatBytes */
export function formatSandboxMegabytes(megabytes: number): string {
  return formatBytes(megabytes * 1024 * 1024);
}

export function safeSandboxPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

export function getSandboxDiskPercent(
  stats: Pick<SandboxStats, "diskUsage" | "diskTotal">,
): number | null {
  if (
    stats.diskUsage == null ||
    stats.diskTotal == null ||
    stats.diskTotal <= 0
  ) {
    return null;
  }

  return safeSandboxPercent((stats.diskUsage / stats.diskTotal) * 100);
}
