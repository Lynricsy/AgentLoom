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

/** 沿 cause 链找到指定错误码的 Postgres 错误，返回其约束名（若有）。 */
export function getPostgresConstraintName(
  error: unknown,
  code: string,
  maxDepth = 4,
): string | undefined {
  let current: unknown = error;

  for (let depth = 0; current && depth <= maxDepth; depth += 1) {
    if (typeof current !== 'object') {
      break;
    }

    const record = current as Record<string, unknown>;
    if (record.code === code) {
      const name = record.constraint_name ?? record.constraint;
      return typeof name === 'string' ? name : undefined;
    }

    current = record.cause;
  }

  return undefined;
}
