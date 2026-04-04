export function hasPostgresErrorCode(
  error: unknown,
  code: string,
  maxDepth = 4,
): boolean {
  let current: unknown = error;
  let depth = 0;

  while (current && depth <= maxDepth) {
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;

      if (record.code === code) {
        return true;
      }

      current = record.cause;
      depth += 1;
      continue;
    }

    break;
  }

  return false;
}
