export function formatWorkspaceSize(bytes: number | null): string {
  if (bytes === null) return "未知";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const base = 1024;
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(base)),
    units.length - 1,
  );
  const size = bytes / Math.pow(base, unitIndex);
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
