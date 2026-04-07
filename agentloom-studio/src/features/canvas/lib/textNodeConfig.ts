function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function readFirstTextValue(
  record: Record<string, unknown> | null,
): string | undefined {
  if (!record) {
    return undefined
  }

  for (const key of ["text", "value", "content"] as const) {
    if (Object.hasOwn(record, key) && typeof record[key] === "string") {
      return record[key] as string
    }
  }

  return undefined
}

export function normalizeTextNodeConfig(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const config = asRecord(data?.config)
  const text = readFirstTextValue(config) ?? readFirstTextValue(data ?? null)

  if (text === undefined) {
    return config ? { ...config } : {}
  }

  return {
    ...(config ?? {}),
    text,
  }
}
