export const DEFAULT_SANDBOX_CONVERSATION_IDLE_AUTO_END_MINUTES = 10

export function normalizeSandboxConversationIdleAutoEndMinutes(
  value: unknown,
  fallback = DEFAULT_SANDBOX_CONVERSATION_IDLE_AUTO_END_MINUTES,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback
  }

  return Math.max(1, Math.ceil(value))
}
