import { type Artifact, code, doc, isSourceTs, read, rel, repoPath, subdirs, table, walk } from '../lib';

const MODULES_DIR = repoPath('agentloom-server/src/modules');
const SERVER_SRC = repoPath('agentloom-server/src');

// 队列常量可能折行：`export const X_QUEUE =\n  'name'`
const QUEUE_CONST_RE = /\b([A-Z][A-Z0-9_]*_QUEUE)\s*=\s*'([a-z0-9-]+)'/g;
const CONTROLLER_RE = /@Controller\(\s*(?:'([^']*)'|"([^"]*)"|\{[^}]*?path:\s*'([^']*)'[^}]*\})?\s*\)/g;
const NAMESPACE_RE = /namespace:\s*'([^']+)'/g;

export interface QueueInfo {
  name: string;
  constant: string;
  file: string;
  worker: string;
}

export function collectQueues(): QueueInfo[] {
  const files = walk(SERVER_SRC, isSourceTs);
  const queues: QueueInfo[] = [];
  for (const file of files) {
    for (const m of read(file).matchAll(QUEUE_CONST_RE)) {
      queues.push({ constant: m[1], name: m[2], file: rel(file), worker: '' });
    }
  }
  // Worker：含 @Processor(<常量>) 的文件中紧随其后的 export class
  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/@Processor\(\s*([A-Z][A-Z0-9_]*_QUEUE)\b/g)) {
      const cls = /export\s+class\s+(\w+)/.exec(src.slice(m.index));
      const q = queues.find((x) => x.constant === m[1]);
      if (q && cls) q.worker = q.worker ? `${q.worker}, ${cls[1]}` : cls[1];
    }
  }
  return queues.sort((a, b) => a.name.localeCompare(b.name));
}

export function serverModulesArtifact(queues: QueueInfo[]): Artifact {
  const rows = subdirs(MODULES_DIR).map((mod) => {
    const files = walk(`${MODULES_DIR}/${mod}`, isSourceTs);
    const prefixes = new Set<string>();
    const namespaces = new Set<string>();
    for (const f of files) {
      const src = read(f);
      if (f.endsWith('.controller.ts')) {
        for (const m of src.matchAll(CONTROLLER_RE)) {
          const p = m[1] ?? m[2] ?? m[3];
          prefixes.add(p ? `/api/v1/${p.replace(/^\//, '')}` : '/api/v1');
        }
      }
      if (f.endsWith('.gateway.ts')) for (const m of src.matchAll(NAMESPACE_RE)) namespaces.add(m[1]);
    }
    const modQueues = queues.filter((q) => q.file.startsWith(`agentloom-server/src/modules/${mod}/`));
    return [
      code(mod),
      [...prefixes].sort().map(code).join('<br>'),
      [...namespaces].sort().map(code).join('<br>'),
      modQueues.map((q) => code(q.name)).join('<br>'),
    ];
  });
  return {
    path: 'server-modules.md',
    content: doc(
      '来源：`agentloom-server/src/modules/*/`。REST 前缀取自各 `*.controller.ts` 的 `@Controller()`（全局前缀 `/api/v1`），Socket 命名空间取自 `*.gateway.ts`，队列取自模块内 `*_QUEUE` 常量。',
      table(['模块', 'REST 前缀', 'Socket 命名空间', 'BullMQ 队列'], rows),
    ),
  };
}

export function queuesArtifact(queues: QueueInfo[]): Artifact {
  return {
    path: 'queues.md',
    content: doc(
      '来源：`agentloom-server/src` 中所有 `*_QUEUE = \'…\'` 常量；Worker 为 `@Processor(<常量>)` 所在类。',
      table(
        ['队列名', '常量', 'Worker', '定义文件'],
        queues.map((q) => [code(q.name), code(q.constant), q.worker ? code(q.worker) : '（无 Worker）', code(q.file)]),
      ),
    ),
  };
}
