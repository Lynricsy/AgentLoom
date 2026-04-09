import type { SandboxConfig } from '../../database/schema';

const HOURS_TO_MS = 60 * 60 * 1000;
const SECONDS_TO_MS = 1000;
const SECONDS_PER_HOUR = 60 * 60;

export function normalizeSandboxTimeoutSeconds(
  value: unknown,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.max(1, Math.ceil(value));
}

export function deriveSandboxTimeoutHours(timeoutSeconds: number): number {
  return Math.max(1, Math.ceil(timeoutSeconds / SECONDS_PER_HOUR));
}

export function resolveSandboxTimeoutDelayMs(
  config: Pick<SandboxConfig, 'timeout'> &
    Partial<Pick<SandboxConfig, 'timeoutSeconds'>>,
): number | null {
  if (
    typeof config.timeoutSeconds === 'number' &&
    Number.isFinite(config.timeoutSeconds) &&
    config.timeoutSeconds > 0
  ) {
    return config.timeoutSeconds * SECONDS_TO_MS;
  }

  if (
    typeof config.timeoutSeconds === 'number' &&
    Number.isFinite(config.timeoutSeconds) &&
    config.timeoutSeconds <= 0
  ) {
    return null;
  }

  if (
    typeof config.timeout !== 'number' ||
    !Number.isFinite(config.timeout) ||
    config.timeout <= 0
  ) {
    return null;
  }

  return config.timeout * HOURS_TO_MS;
}

export function formatSandboxTimeoutLabel(
  config: Pick<SandboxConfig, 'timeout'> &
    Partial<Pick<SandboxConfig, 'timeoutSeconds'>>,
): string {
  if (
    typeof config.timeoutSeconds === 'number' &&
    Number.isFinite(config.timeoutSeconds) &&
    config.timeoutSeconds > 0
  ) {
    return `${config.timeoutSeconds}s`;
  }

  if (
    typeof config.timeoutSeconds === 'number' &&
    Number.isFinite(config.timeoutSeconds) &&
    config.timeoutSeconds <= 0
  ) {
    return '不超时';
  }

  if (
    typeof config.timeout !== 'number' ||
    !Number.isFinite(config.timeout) ||
    config.timeout <= 0
  ) {
    return '不超时';
  }

  return `${config.timeout}h`;
}
