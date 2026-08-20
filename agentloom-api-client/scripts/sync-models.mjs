import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 把 server 生成的纯类型 model 同步到本包源码。
 *
 * 生成端由 `agentloom-server` 的 `sdk:generate:models` 负责（openapitools.json 的
 * `typescriptModels` generator，`withoutRuntimeChecks: true`），产物是单个不含任何
 * runtime 引用的 `models/index.ts`。本脚本只做搬运与校验，不做内容改写。
 */

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(packageRoot, '..');
const source = join(
  repoRoot,
  'agentloom-server',
  'sdk',
  'typescript-models',
  'src',
  'models',
  'index.ts',
);
const target = join(packageRoot, 'src', 'models.ts');

if (!existsSync(source)) {
  console.error(
    `未找到生成产物：${source}\n先运行 pnpm --filter agentloom-server run sdk:generate:models`,
  );
  process.exit(1);
}

const contents = readFileSync(source, 'utf-8');

if (contents.includes("from '../runtime'")) {
  console.error(
    '生成产物仍引用 ../runtime，说明 withoutRuntimeChecks 未生效；拒绝同步。',
  );
  process.exit(1);
}

const interfaceCount = (contents.match(/^export interface /gm) ?? []).length;
if (interfaceCount === 0) {
  console.error('生成产物中没有任何 interface，拒绝同步。');
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

console.log(`已同步 ${interfaceCount} 个类型定义到 ${target}`);
