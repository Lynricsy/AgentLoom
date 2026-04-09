const RECOVERABLE_AGENT_RUNTIME_ERROR_PATTERN =
  /terminated|STREAM_UPSTREAM_ABORTED|upstream.?aborted|other side closed|fetch failed|upstream.?connect|reset before headers|socket hang up|timed? out|timeout|sandbox_timeout|ECONNRESET|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT/i;

export function isRecoverableAgentRuntimeErrorMessage(
  message: string,
): boolean {
  return RECOVERABLE_AGENT_RUNTIME_ERROR_PATTERN.test(message);
}

export function isRecoverableAgentRuntimeError(error: unknown): boolean {
  return collectAgentRuntimeErrorMessages(error).some((message) =>
    isRecoverableAgentRuntimeErrorMessage(message),
  );
}

function collectAgentRuntimeErrorMessages(error: unknown): string[] {
  const messages = new Set<string>();
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null || visited.has(current)) {
      continue;
    }

    if (typeof current === 'object' || typeof current === 'function') {
      visited.add(current);
    }

    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        messages.add(trimmed);
      }
      continue;
    }

    if (current instanceof Error) {
      if (current.message.trim().length > 0) {
        messages.add(current.message.trim());
      }
      queue.push(current.cause);
    }

    if (!isRecord(current)) {
      continue;
    }

    for (const key of [
      'message',
      'rawMessage',
      'detail',
      'errorMessage',
      'code',
    ] as const) {
      const value = current[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        messages.add(value.trim());
      }
    }

    queue.push(current.cause);
  }

  return [...messages];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
