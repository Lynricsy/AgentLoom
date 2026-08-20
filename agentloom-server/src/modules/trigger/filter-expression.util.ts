import { Script } from 'node:vm';

import type { EventPayload } from './adapters/event-source.adapter';

const FILTER_EXPRESSION_TIMEOUT_MS = 1000;

/**
 * 在隔离上下文中对 api_event trigger 的过滤表达式求值，按 JS 真值判定。
 *
 * 可用变量：`payload`（事件 data）、`source`（事件来源）、`type`（事件类型）。
 * 语法错误、运行时异常与超时都会抛出，由调用方按 fail-closed 处理。
 */
export function evaluateFilterExpression(
  expression: string,
  payload: EventPayload,
): boolean {
  const script = new Script(`(${expression})`);

  return Boolean(
    script.runInNewContext(
      {
        payload: payload.data,
        source: payload.source,
        type: payload.type,
      },
      { timeout: FILTER_EXPRESSION_TIMEOUT_MS },
    ),
  );
}
