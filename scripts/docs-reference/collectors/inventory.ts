import { existsSync } from 'node:fs';
import { BUILTIN_SKILL_SLUGS } from '../../../agentloom-server/src/database/seeds/skill-seeds';
import { type Artifact, cell, code, doc, read, rel, repoPath, subdirs, table, walk } from '../lib';

export function builtinSkillsArtifact(): Artifact {
  const rows = BUILTIN_SKILL_SLUGS.map((slug) => {
    const file = repoPath('agentloom-server/src/database/seeds/skills', slug, 'SKILL.md');
    const front = existsSync(file) ? (/^---\n([\s\S]*?)\n---/.exec(read(file))?.[1] ?? '') : '';
    const field = (name: string) => new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(front)?.[1]?.replace(/^['"]|['"]$/g, '');
    return [code(slug), cell(field('name')), cell(field('description'))];
  });
  return {
    path: 'builtin-skills.md',
    content: doc(
      '来源：`agentloom-server/src/database/seeds/skill-seeds.ts` 的 `BUILTIN_SKILL_SLUGS`；名称与说明取自 `seeds/skills/<slug>/SKILL.md` frontmatter（说明为英文原文）。',
      table(['slug', 'name', 'description'], rows),
    ),
  };
}

export function studioFeaturesArtifact(): Artifact {
  const dir = repoPath('agentloom-studio/src/features');
  return {
    path: 'studio-features.md',
    content: doc(
      '来源：`agentloom-studio/src/features/*`（跨 feature 只能经各自 `index.ts` barrel 引用）。',
      table(
        ['feature', '有 index.ts barrel'],
        subdirs(dir).map((f) => [code(f), existsSync(`${dir}/${f}/index.ts`) ? '是' : '否']),
      ),
    ),
  };
}

export function studioRoutesArtifact(): Artifact {
  const dir = repoPath('agentloom-studio/src/app/routes');
  const files = walk(
    dir,
    (f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && !f.includes('/__tests__/') && !f.endsWith('__root.tsx'),
  );
  const rows = files.flatMap((file) => {
    // 手动路由树：URL 以 createRoute({ path }) 为准，文件名不等于 URL
    const m = /createRoute\(\s*\{[\s\S]*?\bpath:\s*['"]([^'"]+)['"]/.exec(read(file));
    return m ? [[code(m[1].replace(/\$(\w+)/g, ':$1')), code(rel(file).replace('agentloom-studio/src/app/routes/', ''))]] : [];
  });
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return {
    path: 'studio-routes.md',
    content: doc(
      '来源：`agentloom-studio/src/app/routes/**/*.tsx` 中 `createRoute({ path })`（TanStack Router 手动路由树，`$param` 记为 `:param`）。',
      table(['URL', '路由文件（相对 `src/app/routes/`）'], rows),
    ),
  };
}

export function mobileFeaturesArtifact(): Artifact {
  const dir = repoPath('agentloom_mobile/lib/features');
  return {
    path: 'mobile-features.md',
    content: doc(
      '来源：`agentloom_mobile/lib/features/*`（每个 feature 下按 api / models / providers / screens 分层）。',
      table(
        ['feature', '子目录'],
        subdirs(dir).map((f) => [code(f), subdirs(`${dir}/${f}`).map(code).join(' ')]),
      ),
    ),
  };
}
