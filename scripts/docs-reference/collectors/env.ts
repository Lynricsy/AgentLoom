import { envSchema } from '../../../agentloom-server/src/config/env.schema';
import { type Artifact, cell, code, doc, isSourceTs, parseEnvFile, read, rel, repoPath, table, walk } from '../lib';

export const SERVER_ENV_EXAMPLE = repoPath('agentloom-server/.env.example');
export const DEPLOY_ENV_TEMPLATE = repoPath('agentloom-deploy/.env.template');
export const STUDIO_ENV_EXAMPLE = repoPath('agentloom-studio/.env.example');

/** zod 4 schema 的最小内部视图：只读取 `_zod.def` 中本生成器用到的字段 */
interface ZodLike {
  _zod: {
    def: {
      type: string;
      defaultValue?: unknown;
      innerType?: ZodLike;
      in?: ZodLike;
      out?: ZodLike;
      entries?: Record<string, string>;
    };
  };
}

interface FieldInfo {
  required: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
  values?: string[];
}

/**
 * 解包规则：default → 可选且带默认值；optional → 可选；
 * pipe（preprocess / transform）→ 合并 in 与 out 两侧；其余视为必填。
 */
function describe(schema: ZodLike): FieldInfo {
  const def = schema._zod.def;
  switch (def.type) {
    case 'default': {
      const inner = def.innerType ? describe(def.innerType) : undefined;
      return { required: false, hasDefault: true, defaultValue: def.defaultValue, values: inner?.values };
    }
    case 'optional': {
      const inner = def.innerType ? describe(def.innerType) : undefined;
      return { required: false, hasDefault: false, values: inner?.values };
    }
    case 'pipe': {
      const a = def.in ? describe(def.in) : { required: true, hasDefault: false };
      const b = def.out ? describe(def.out) : { required: true, hasDefault: false };
      const withDefault = a.hasDefault ? a : b.hasDefault ? b : undefined;
      return {
        required: a.required && b.required,
        hasDefault: withDefault !== undefined,
        defaultValue: withDefault?.defaultValue,
        values: a.values ?? b.values,
      };
    }
    case 'enum':
      return { required: true, hasDefault: false, values: Object.values(def.entries ?? {}) };
    default:
      return { required: true, hasDefault: false };
  }
}

export function serverEnvKeys(): string[] {
  return Object.keys(envSchema.shape);
}

/** server 源码中绕过 envSchema、直接读取 process.env 的变量 → 读取位置 */
function directEnvReads(schemaKeys: Set<string>): Map<string, string[]> {
  const reads = new Map<string, string[]>();
  for (const file of walk(repoPath('agentloom-server/src'), isSourceTs)) {
    for (const m of read(file).matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*'([A-Z][A-Z0-9_]*)'\s*\])/g)) {
      const key = m[1] ?? m[2];
      if (schemaKeys.has(key)) continue;
      const files = reads.get(key) ?? [];
      if (!files.includes(rel(file))) files.push(rel(file));
      reads.set(key, files);
    }
  }
  return new Map([...reads].sort(([a], [b]) => a.localeCompare(b)));
}

export function envServerArtifact(): Artifact {
  const comments = new Map(parseEnvFile(SERVER_ENV_EXAMPLE).map((e) => [e.key, e.comment]));
  const shape: Record<string, ZodLike> = envSchema.shape;
  const rows = Object.entries(shape).map(([key, schema]) => {
    const info = describe(schema);
    return [
      code(key),
      info.required ? '是' : '否',
      info.hasDefault ? code(info.defaultValue === '' ? '""' : String(info.defaultValue)) : '',
      (info.values ?? []).map(code).join(' / '),
      cell(comments.get(key)),
    ];
  });
  const direct = directEnvReads(new Set(Object.keys(shape)));
  const directRows = [...direct].map(([key, files]) => [
    code(key),
    files.map(code).join('<br>'),
    cell(comments.get(key)),
  ]);
  return {
    path: 'env-server.md',
    content: doc(
      '来源：`agentloom-server/src/config/env.schema.ts` 的 `envSchema`（启动时校验，失败即退出）；说明取自 `agentloom-server/.env.example` 中该变量上方的注释。',
      table(['变量', '必填', '默认值', '取值', '说明'], rows),
      '**未经 `envSchema` 校验、由源码直接读取 `process.env` 的变量**（缺省时行为以读取处代码为准）：',
      table(['变量', '读取位置', '说明'], directRows),
    ),
  };
}

function templateArtifact(path: string, source: string, intro: string): Artifact {
  const rows = parseEnvFile(source).map((e) => [code(e.key), e.value === '' ? '' : code(e.value), cell(e.comment)]);
  return { path, content: doc(intro, table(['变量', '模板值', '说明'], rows)) };
}

/** Compose 文件中出现、但 .env.template 未声明的插值变量：`${KEY}` / `${KEY:-默认}` / `${KEY:?提示}` */
function composeOnlyRows(templateKeys: Set<string>): string[][] {
  const found = new Map<string, { rule: string; files: string[] }>();
  const composeFiles = walk(repoPath('agentloom-deploy'), (f) => /\/docker-compose[^/]*\.ya?ml$/.test(f));
  for (const file of composeFiles) {
    for (const m of read(file).matchAll(/\$\{([A-Z][A-Z0-9_]*)(?:(:?[-?])([^}]*))?\}/g)) {
      const key = m[1];
      if (templateKeys.has(key)) continue;
      const entry = found.get(key) ?? { rule: '', files: [] };
      if (!entry.rule && m[2]) entry.rule = m[2].endsWith('?') ? `必填（${m[3]}）` : `默认 ${code(m[3] === '' ? '""' : m[3])}`;
      if (!entry.files.includes(rel(file))) entry.files.push(rel(file));
      found.set(key, entry);
    }
  }
  return [...found]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, e]) => [code(key), cell(e.rule), e.files.map(code).join('<br>')]);
}

export function envDeployArtifact(): Artifact {
  const entries = parseEnvFile(DEPLOY_ENV_TEMPLATE);
  return {
    path: 'env-deploy.md',
    content: doc(
      '来源：`agentloom-deploy/.env.template`（Docker Compose 部署的变量合同；`agentloom-deploy/scripts/generate-secrets.sh` 复制它生成 `.env` 并填充密钥）。说明取自变量上方注释。',
      table(
        ['变量', '模板值', '说明'],
        entries.map((e) => [code(e.key), e.value === '' ? '' : code(e.value), cell(e.comment)]),
      ),
      '**仅在 Compose 文件中出现的插值变量**（`.env.template` 未声明；未设置时按 Compose 中的默认值或报错）：',
      table(['变量', 'Compose 规则', '出现文件'], composeOnlyRows(new Set(entries.map((e) => e.key)))),
    ),
  };
}

export function envStudioArtifact(): Artifact {
  return templateArtifact(
    'env-studio.md',
    STUDIO_ENV_EXAMPLE,
    '来源：`agentloom-studio/.env.example`（Vite 构建期变量；生产镜像在容器启动时替换 `__VITE_*__` 占位符）。',
  );
}
