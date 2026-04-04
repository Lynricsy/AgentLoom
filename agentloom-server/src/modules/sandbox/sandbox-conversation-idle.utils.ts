import type { SandboxConfig } from '../../database/schema';

const MINUTES_TO_MS = 60 * 1000;

export const DEFAULT_SANDBOX_CONVERSATION_IDLE_AUTO_END_MINUTES = 10;

export function normalizeSandboxConversationIdleAutoEndMinutes(
  value: unknown,
  fallback = DEFAULT_SANDBOX_CONVERSATION_IDLE_AUTO_END_MINUTES,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.ceil(value));
}

export function resolveSandboxConversationIdleAutoEndMinutes(
  config: Partial<Pick<SandboxConfig, 'conversationIdleAutoEndMinutes'>>,
): number {
  return normalizeSandboxConversationIdleAutoEndMinutes(
    config.conversationIdleAutoEndMinutes,
  );
}

export function resolveSandboxConversationIdleAutoEndDelayMs(
  config: Partial<Pick<SandboxConfig, 'conversationIdleAutoEndMinutes'>>,
): number {
  return (
    resolveSandboxConversationIdleAutoEndMinutes(config) * MINUTES_TO_MS
  );
}
