/** 本包唯一的通用对象守卫：只证明是普通对象，字段仍为 unknown */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
