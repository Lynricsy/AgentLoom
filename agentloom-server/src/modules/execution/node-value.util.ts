import type { ReactFlowEdge } from '../../database/schema';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function readOptionalNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

export function readFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

export function readFirstDefined<T>(...values: T[]): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function readStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }

    return value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }

  return [];
}

export function readHttpMethod(
  value: unknown,
): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
  return value === 'POST' ||
    value === 'PUT' ||
    value === 'PATCH' ||
    value === 'DELETE'
    ? value
    : 'GET';
}

export function getRuntimeNodeData(
  nodeData: Record<string, unknown>,
): Record<string, unknown> {
  const config = isRecord(nodeData.config) ? nodeData.config : {};
  return { ...config, ...nodeData };
}

export function resolveTextNodeContent(
  nodeData: Record<string, unknown>,
): string {
  const config = isRecord(nodeData.config) ? nodeData.config : undefined;

  const candidates = [
    config?.text,
    config?.value,
    config?.content,
    nodeData.text,
    nodeData.value,
    nodeData.content,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return '';
}

export function readEdgeHandle(
  edge: ReactFlowEdge,
  handleKind: 'source' | 'target',
): string | undefined {
  const rawEdge = edge as unknown as Record<string, unknown>;

  return readFirstString(
    handleKind === 'source' ? edge.sourceHandle : edge.targetHandle,
    rawEdge[`${handleKind}_handle`],
  );
}

/**
 * 简单 JSON 路径解析（支持 `key.nested.field` 与 `items[0].name` 格式）。
 */
export function resolveJsonPath(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  if (!path) {
    return obj;
  }

  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  return segments.reduce<unknown>((acc, key) => {
    if (Array.isArray(acc)) {
      const index = Number.parseInt(key, 10);
      return Number.isFinite(index) ? acc[index] : undefined;
    }

    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }

    return undefined;
  }, obj);
}

export function setValueAtPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) {
    return;
  }

  let cursor = target;

  for (const [index, segment] of segments.entries()) {
    const isLeaf = index === segments.length - 1;

    if (isLeaf) {
      const existingValue = cursor[segment];
      if (existingValue === undefined) {
        cursor[segment] = value;
        return;
      }

      if (Array.isArray(existingValue)) {
        existingValue.push(value);
        cursor[segment] = existingValue;
        return;
      }

      cursor[segment] = [existingValue, value];
      return;
    }

    const next = cursor[segment];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  }
}

/**
 * 扁平化输入：将 `{ [nodeId]: { field: value } }` 展开。
 *
 * 多个源节点有同名字段时后者覆盖前者。
 */
export function flattenInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = value;
    if (value && typeof value === 'object') {
      flattenInputInto(result, key, value);
    }
  }
  return result;
}

export function flattenInputInto(
  target: Record<string, unknown>,
  prefix: string,
  value: unknown,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const nextPath = `${prefix}[${index}]`;
      target[nextPath] = entry;
      if (entry && typeof entry === 'object') {
        flattenInputInto(target, nextPath, entry);
      }
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [childKey, childValue] of Object.entries(value)) {
    const nextPath = `${prefix}.${childKey}`;
    target[nextPath] = childValue;
    if (childValue && typeof childValue === 'object') {
      flattenInputInto(target, nextPath, childValue);
    }
  }
}

export function buildExpressionPorts(
  input: Record<string, unknown>,
): Record<number, unknown> {
  const ports: Record<number, unknown> = {};
  const orderedInputs = Object.entries(input)
    .filter(([key]) => key.startsWith('input-'))
    .sort(([left], [right]) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );

  orderedInputs.forEach(([_, value], index) => {
    ports[index + 1] = value;
  });

  return ports;
}

export function normalizeTransformResult(
  result: unknown,
): Record<string, unknown> {
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }

  return { value: result };
}

export function extractExecutionInputPayload(
  inputParams: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!isRecord(inputParams)) {
    return {};
  }

  const payload = { ...inputParams };
  delete payload._meta;
  return payload;
}

export function extractOutputValue(input: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(input, 'content-in')) {
    return input['content-in'];
  }

  if (Object.prototype.hasOwnProperty.call(input, 'content')) {
    return input.content;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'json')) {
    return input.json;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'value')) {
    return input.value;
  }

  const values = Object.values(input);
  if (values.length === 1) {
    return values[0];
  }

  return input;
}

export function stringifyOutputValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return '';
  }

  return JSON.stringify(value ?? null);
}

export function normalizeJsonOutputValue(
  value: unknown,
): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  return { value };
}

export function parseJsonLikeValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function keyValuePairsToRecord(
  value: unknown,
  parseJsonValue = false,
): Record<string, unknown> {
  if (!Array.isArray(value)) {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const key = readFirstString(entry.key);
    if (!key || typeof entry.value !== 'string') {
      continue;
    }

    result[key] = parseJsonValue
      ? parseJsonLikeValue(entry.value)
      : entry.value;
  }

  return result;
}

export function extractCodeToolInputPayload(
  input: Record<string, unknown>,
): unknown {
  if (Object.prototype.hasOwnProperty.call(input, 'input-in')) {
    return input['input-in'];
  }

  if (Object.prototype.hasOwnProperty.call(input, 'input')) {
    return input.input;
  }

  const stripped = stripExecOnlyInputs(input);
  if (!stripped) {
    return {};
  }

  const values = Object.values(stripped);
  return values.length === 1 ? values[0] : stripped;
}

export function stripExecOnlyInputs(
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const entries = Object.entries(input).filter(
    ([key]) => key !== 'exec-in' && key !== 'exec_in',
  );
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}
