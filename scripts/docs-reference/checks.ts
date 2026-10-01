import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS_ROOT, REPO_ROOT, read, rel, repoPath, walk } from './lib';
import { DEPLOY_ENV_TEMPLATE, SERVER_ENV_EXAMPLE, STUDIO_ENV_EXAMPLE, serverEnvKeys } from './collectors/env';
import { NODE_TYPES } from './collectors/nodes';

export interface CheckResult {
  name: string;
  failures: string[];
  summary: string;
}

const ENV_RE =
  /\b(?:APP|VITE|SUPABASE|FIRECRACKER|POSTGRES|MINIO|REDIS|QDRANT|NGINX|BACKUP|COMPOSE|DOCS|SERVER|STUDIO|WORKER|GOTRUE|KONG|RUN)_[A-Z0-9_]+\b/g;
// 仓库路径：以根目录名开头且带 `/` 才校验；不带 `/` 的 `agentloom-xxx` 可能是命令名、systemd 单元名或 compose 项目名
const PATH_RE = /^(agentloom-[a-z-]+|agentloom_mobile|scripts|brochure)(\/[^`\s:]*)?/;

/** 文档页中的行内代码片段（跳过围栏代码块），带行号 */
function inlineCodeSpans(file: string): Array<{ line: number; text: string }> {
  const spans: Array<{ line: number; text: string }> = [];
  let fenced = false;
  read(file)
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return;
      }
      if (fenced) return;
      for (const m of line.matchAll(/`([^`\n]+)`/g)) spans.push({ line: i + 1, text: m[1] });
    });
  return spans;
}

/** 站点页面：与 VitePress srcExclude 一致，排除 _generated、AGENTS.md、README.md */
function docPages(): string[] {
  return walk(DOCS_ROOT, (f) => f.endsWith('.md') && !f.includes('/_generated/')).filter(
    (f) => !/\/(AGENTS|README)\.md$/.test(f.slice(DOCS_ROOT.length)),
  );
}

/** 单层花括号展开：a/{b,c}.ts → a/b.ts, a/c.ts（支持多组） */
function expandBraces(path: string): string[] {
  const m = /\{([^{}]+)\}/.exec(path);
  if (!m) return [path];
  return m[1].split(',').flatMap((alt) => expandBraces(path.slice(0, m.index) + alt.trim() + path.slice(m.index + m[0].length)));
}

/** (b) 反引号中的仓库路径必须存在 */
export function checkPaths(): CheckResult {
  const failures: string[] = [];
  let checked = 0;
  for (const file of docPages()) {
    for (const { line, text } of inlineCodeSpans(file)) {
      const m = PATH_RE.exec(text.trim());
      if (!m) continue;
      const path = m[0].replace(/[.,;)]+$/, '');
      if (!path.includes('/')) continue;
      // 占位符/通配符路径（<type>、*、$param）不是具体文件，跳过
      if (/[<*$]/.test(path)) continue;
      for (const candidate of expandBraces(path)) {
        checked++;
        if (!existsSync(join(REPO_ROOT, candidate))) failures.push(`${rel(file)}:${line}: ${candidate}`);
      }
    }
  }
  return { name: '(b) 路径存在', failures, summary: `${checked} 个路径引用` };
}

/** 已知环境变量：env schema、env 模板、compose、脚本、Helm、Dockerfile、源码中出现过的全部变量名 */
function knownEnvNames(): Set<string> {
  const known = new Set(serverEnvKeys());
  const sources = [
    SERVER_ENV_EXAMPLE,
    DEPLOY_ENV_TEMPLATE,
    STUDIO_ENV_EXAMPLE,
    ...walk(repoPath('agentloom-deploy'), (f) => /\.(ya?ml|sh|example|template|conf|service|timer|json)$|Dockerfile$/.test(f) || /\/envs\//.test(f)),
    ...walk(repoPath('agentloom-firecracker-runtime'), (f) => /\.(go|sh)$/.test(f)),
    ...walk(repoPath('agentloom-server/src'), (f) => f.endsWith('.ts')),
    ...walk(repoPath('agentloom-studio/src'), (f) => /\.tsx?$/.test(f)),
    repoPath('agentloom-studio/vite.config.ts'),
  ];
  for (const file of sources) {
    if (!existsSync(file)) continue;
    for (const m of read(file).matchAll(ENV_RE)) known.add(m[0]);
  }
  return known;
}

/** (c) 反引号中的环境变量名必须在代码/模板中存在 */
export function checkEnvNames(): CheckResult {
  const known = knownEnvNames();
  const failures: string[] = [];
  let checked = 0;
  for (const file of docPages()) {
    for (const { line, text } of inlineCodeSpans(file)) {
      for (const m of text.matchAll(ENV_RE)) {
        checked++;
        if (!known.has(m[0])) failures.push(`${rel(file)}:${line}: ${m[0]}`);
      }
    }
  }
  return { name: '(c) 环境变量名', failures, summary: `${checked} 处引用，已知变量 ${known.size} 个` };
}

const LOOP_TYPES = ['loop-start', 'loop-state', 'break', 'continue', 'result'];

/** 节点类型 → 承载它的 guide/nodes 页面 */
export function nodePageFor(type: string): string {
  if (type.endsWith('-trigger')) return 'trigger.md';
  if (LOOP_TYPES.includes(type)) return 'loop.md';
  if (type === 'iteration-start') return 'iteration.md';
  return `${type}.md`;
}

/** (d) 每个节点类型都有页面且页面 include 了对应生成表 */
export function checkNodePages(): CheckResult {
  const failures: string[] = [];
  const dir = join(DOCS_ROOT, 'guide/nodes');
  for (const type of NODE_TYPES) {
    const page = join(dir, nodePageFor(type));
    if (!existsSync(page)) {
      failures.push(`guide/nodes/${nodePageFor(type)} 不存在（节点 ${type}）`);
    } else if (!read(page).includes(`_generated/nodes/${type}.md`)) {
      failures.push(`guide/nodes/${nodePageFor(type)} 缺少 include _generated/nodes/${type}.md`);
    }
  }
  return { name: '(d) 节点页覆盖', failures, summary: `${NODE_TYPES.length} 个节点类型` };
}

/** (e) 根下每个 agentloom* 目录都出现在 dev/index.md 仓库地图中 */
export function checkRepoMap(): CheckResult {
  const indexFile = join(DOCS_ROOT, 'dev/index.md');
  const text = existsSync(indexFile) ? read(indexFile) : '';
  const dirs = readdirSync(REPO_ROOT).filter((n) => n.startsWith('agentloom') && statSync(join(REPO_ROOT, n)).isDirectory());
  const failures = dirs.filter((d) => !text.includes(d)).map((d) => `dev/index.md 未提及 ${d}`);
  return { name: '(e) 仓库地图', failures, summary: `${dirs.length} 个 agentloom* 目录` };
}
