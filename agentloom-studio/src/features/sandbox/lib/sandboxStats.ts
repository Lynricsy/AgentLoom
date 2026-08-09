import type { SandboxStats } from "../types";

export function formatSandboxBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSandboxMegabytes(megabytes: number): string {
  if (megabytes <= 0) return "0 MB";
  if (megabytes < 1024) return `${Math.round(megabytes)} MB`;

  const gigabytes = megabytes / 1024;
  return `${gigabytes.toFixed(gigabytes >= 10 ? 0 : 1)} GB`;
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
