export function snakeToCamel(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(snakeToCamel)
  }
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        snakeToCamel(value),
      ])
    )
  }
  return data
}

export function camelToSnake(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(camelToSnake)
  }
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([key, value]) => [
        key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        camelToSnake(value),
      ])
    )
  }
  return data
}
