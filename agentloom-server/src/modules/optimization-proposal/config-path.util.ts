import { isRecord } from '../execution/node-value.util';

type JsonRecord = Record<string, unknown>;

function splitPath(path: string): string[] {
  const segments = path.split('.');
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`配置路径非法：${path}`);
  }
  return segments;
}

/** 按点路径读取节点 data 中的值；中间层缺失或非对象时返回 undefined */
export function getConfigPathValue(data: JsonRecord, path: string): unknown {
  let cursor: unknown = data;
  for (const segment of splitPath(path)) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

/**
 * 按点路径写入值，返回新对象（不修改入参）。
 *
 * 缺失的中间层创建为 `{}`；中间层存在但不是对象时抛错（补丁与节点结构不符）。
 * `value === undefined` 表示删除末级键。
 */
export function setConfigPathValue(
  data: JsonRecord,
  path: string,
  value: unknown,
): JsonRecord {
  const segments = splitPath(path);

  const assign = (target: JsonRecord, depth: number): JsonRecord => {
    const key = segments[depth];
    const next = { ...target };
    if (depth === segments.length - 1) {
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    }
    const child = target[key];
    if (child !== undefined && child !== null && !isRecord(child)) {
      throw new Error(
        `配置路径 ${segments.slice(0, depth + 1).join('.')} 不是对象`,
      );
    }
    next[key] = assign(isRecord(child) ? child : {}, depth + 1);
    return next;
  };

  return assign(data, 0);
}
