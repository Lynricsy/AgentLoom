import * as contracts from '../../../agentloom-contracts/src/index';
import { EXECUTION_EVENT_NAMES } from '../../../agentloom-contracts/src/execution-events';
import { type Artifact, code, doc, read, rel, repoPath, table, walk } from '../lib';

interface SocketEvent {
  namespace: string;
  direction: 'server→client' | 'client→server';
  event: string;
  source: string;
}

/** contracts 中导出的字符串常量（用于解析 `.emit(SOME_EVENT_CONST` 形式） */
const CONTRACT_STRINGS: Record<string, string> = {};
for (const [name, value] of Object.entries(contracts)) {
  if (typeof value === 'string') CONTRACT_STRINGS[name] = value;
}

export function collectSocketEvents(): SocketEvent[] {
  const events: SocketEvent[] = [];
  const add = (e: SocketEvent) => {
    if (!events.some((x) => x.namespace === e.namespace && x.direction === e.direction && x.event === e.event)) {
      events.push(e);
    }
  };
  const gateways = walk(repoPath('agentloom-server/src/modules'), (f) => f.endsWith('.gateway.ts'));
  for (const file of gateways) {
    const src = read(file);
    const ns = /namespace:\s*'([^']+)'/.exec(src)?.[1];
    if (!ns) continue;
    const source = rel(file);
    for (const m of src.matchAll(/@SubscribeMessage\(\s*'([^']+)'/g)) {
      add({ namespace: ns, direction: 'client→server', event: m[1], source });
    }
    if (ns === '/execution') {
      for (const name of EXECUTION_EVENT_NAMES) {
        add({ namespace: ns, direction: 'server→client', event: name, source: 'agentloom-contracts/src/execution-events.ts' });
      }
    }
    // gateway 内声明的事件名表：export const XxxEventName = { K: 'v', ... }
    for (const block of src.matchAll(/export const \w*EventNames?\s*=\s*\{([\s\S]*?)\}/g)) {
      for (const m of block[1].matchAll(/:\s*'([^']+)'/g)) add({ namespace: ns, direction: 'server→client', event: m[1], source });
    }
    for (const m of src.matchAll(/\.emit\(\s*'([^']+)'/g)) add({ namespace: ns, direction: 'server→client', event: m[1], source });
    for (const m of src.matchAll(/\.emit\(\s*([A-Z][A-Z0-9_]*)\b/g)) {
      const value = CONTRACT_STRINGS[m[1]];
      if (value) add({ namespace: ns, direction: 'server→client', event: value, source: 'agentloom-contracts/src' });
    }
  }
  return events.sort(
    (a, b) => a.namespace.localeCompare(b.namespace) || b.direction.localeCompare(a.direction) || a.event.localeCompare(b.event),
  );
}

export function socketEventsArtifact(events: SocketEvent[]): Artifact {
  return {
    path: 'socket-events.md',
    content: doc(
      '来源：`agentloom-server/src/modules/**/*.gateway.ts`。client→server 为 `@SubscribeMessage` 事件；server→client 为 gateway 内事件名常量、`.emit()` 字面量，以及 `/execution` 的 `EXECUTION_EVENT_NAMES`（`agentloom-contracts/src/execution-events.ts`）。',
      table(
        ['命名空间', '方向', '事件', '来源文件'],
        events.map((e) => [code(e.namespace), e.direction, code(e.event), code(e.source)]),
      ),
    ),
  };
}
