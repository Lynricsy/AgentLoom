/**
 * 文档参考生成器与漂移守卫。
 *
 *   pnpm docs:gen    从代码生成 agentloom-docs/_generated/**
 *   pnpm docs:check  校验 _generated 与代码一致，并检查文档中的路径、环境变量、节点页覆盖、仓库地图
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { type CheckResult, checkEnvNames, checkNodePages, checkPaths, checkRepoMap } from './checks';
import { envDeployArtifact, envServerArtifact, envStudioArtifact } from './collectors/env';
import {
  builtinSkillsArtifact,
  mobileFeaturesArtifact,
  studioFeaturesArtifact,
  studioRoutesArtifact,
} from './collectors/inventory';
import { nodeArtifacts, portDataTypesArtifact } from './collectors/nodes';
import { collectQueues, queuesArtifact, serverModulesArtifact } from './collectors/server';
import { collectSocketEvents, socketEventsArtifact } from './collectors/socket';
import { collectTables, tablesArtifact } from './collectors/tables';
import { type Artifact, GENERATED_DIR, walk } from './lib';

function buildArtifacts(): { artifacts: Artifact[]; counts: Record<string, number> } {
  const queues = collectQueues();
  const tables = collectTables();
  const events = collectSocketEvents();
  const nodes = nodeArtifacts();
  const artifacts = [
    serverModulesArtifact(queues),
    queuesArtifact(queues),
    tablesArtifact(tables),
    envServerArtifact(),
    envDeployArtifact(),
    envStudioArtifact(),
    ...nodes,
    portDataTypesArtifact(),
    socketEventsArtifact(events),
    builtinSkillsArtifact(),
    studioFeaturesArtifact(),
    studioRoutesArtifact(),
    mobileFeaturesArtifact(),
  ];
  // 计数取自生成表的数据行数，避免与产物各自维护一份
  const rowsOf = (path: string) => {
    const a = artifacts.find((x) => x.path === path);
    const firstTable = a?.content.split('\n\n').find((b) => b.startsWith('| '));
    return firstTable ? firstTable.trim().split('\n').length - 2 : 0;
  };
  return {
    artifacts,
    counts: {
      模块: rowsOf('server-modules.md'),
      队列: queues.length,
      表: tables.length,
      节点类型: nodes.length - 1,
      端口类型: rowsOf('port-data-types.md'),
      Socket事件: events.length,
      内置技能: rowsOf('builtin-skills.md'),
      'Studio feature': rowsOf('studio-features.md'),
      'Studio 路由': rowsOf('studio-routes.md'),
      'Mobile feature': rowsOf('mobile-features.md'),
    },
  };
}

function existingGenerated(): string[] {
  return existsSync(GENERATED_DIR) ? walk(GENERATED_DIR, (f) => f.endsWith('.md')).map((f) => relative(GENERATED_DIR, f)) : [];
}

function generate(artifacts: Artifact[]): void {
  const expected = new Set(artifacts.map((a) => a.path));
  for (const stale of existingGenerated().filter((p) => !expected.has(p))) rmSync(join(GENERATED_DIR, stale));
  for (const a of artifacts) {
    const target = join(GENERATED_DIR, a.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, a.content);
  }
  console.log(`[docs:gen] 写入 ${artifacts.length} 个文件到 agentloom-docs/_generated/`);
}

/** (a) _generated 与代码一致 */
function checkGenerated(artifacts: Artifact[]): CheckResult {
  const failures: string[] = [];
  const expected = new Set(artifacts.map((a) => a.path));
  for (const a of artifacts) {
    const target = join(GENERATED_DIR, a.path);
    if (!existsSync(target)) failures.push(`缺失 _generated/${a.path}`);
    else if (readFileSync(target, 'utf8') !== a.content) failures.push(`过期 _generated/${a.path}`);
  }
  for (const stale of existingGenerated().filter((p) => !expected.has(p))) failures.push(`多余 _generated/${stale}`);
  return { name: '(a) 生成参考一致', failures, summary: `${artifacts.length} 个文件` };
}

function main(): void {
  const check = process.argv.includes('--check');
  const { artifacts, counts } = buildArtifacts();
  if (!check) {
    generate(artifacts);
    console.log(Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('，'));
    return;
  }
  const results = [checkGenerated(artifacts), checkPaths(), checkEnvNames(), checkNodePages(), checkRepoMap()];
  let failed = false;
  for (const r of results) {
    if (r.failures.length === 0) {
      console.log(`✓ ${r.name}：${r.summary}`);
      continue;
    }
    failed = true;
    console.error(`✗ ${r.name}：${r.failures.length} 项失败`);
    for (const f of r.failures) console.error(`    ${f}`);
  }
  console.log(Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('，'));
  if (failed) {
    if (results[0].failures.length > 0) console.error('生成参考已过期：运行 pnpm docs:gen 并提交 agentloom-docs/_generated/');
    process.exit(1);
  }
}

main();
