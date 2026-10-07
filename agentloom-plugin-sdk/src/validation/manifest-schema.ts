import { valid as semverValid } from 'semver';
import { z } from 'zod';

import { PLUGIN_PERMISSIONS, type PluginPermission } from '../types';

const pluginPermissionValues = [...PLUGIN_PERMISSIONS] as [PluginPermission, ...PluginPermission[]];

const NonEmptyStringSchema = z.string().trim().min(1, { message: '必须是非空字符串。' });

/**
 * reverse-domain 格式的插件 ID 校验器。
 */
export const ReverseDomainPluginIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/, { message: '必须使用 reverse-domain 格式。' });

/**
 * semver 版本字符串校验器。
 */
export const SemverStringSchema = z.string().refine((value) => semverValid(value) !== null, {
  message: '必须是合法的 semver 版本字符串。',
});

/**
 * 插件权限枚举校验器。
 */
export const PluginPermissionSchema = z.enum(pluginPermissionValues);

/**
 * 插件包类型：`node` 为画布节点插件（WASM），`runtime` 为 sandbox 内 dsh runtime 插件。
 */
export const PluginKindSchema = z.enum(['node', 'runtime']);

/**
 * 归档内安全相对路径：不得以 `/` 开头、不得包含 `..` 或反斜杠。
 */
const ARCHIVE_RELATIVE_PATH_PATTERN = /^(?!\/)(?!.*\.\.)(?!.*\\).+/;

/**
 * runtime 插件（dsh Cordis 插件包）的声明。
 */
export const PluginRuntimeSchema = z.object({
  /** 目标 `@deepseek-ai/dsh` 版本，服务端按平台当前支持的版本精确比对。 */
  dshVersion: NonEmptyStringSchema,
  /** 包内 cordis.patch.yml 相对路径。 */
  patch: z
    .string()
    .regex(new RegExp(`${ARCHIVE_RELATIVE_PATH_PATTERN.source}\\.ya?ml$`), {
      message: '必须是归档内指向 .yml/.yaml 文件的安全相对路径。',
    }),
  /** 包内 ESM 入口（package.json main）相对路径。 */
  entry: z
    .string()
    .regex(new RegExp(`${ARCHIVE_RELATIVE_PATH_PATTERN.source}\\.m?js$`), {
      message: '必须是归档内指向 .js/.mjs 文件的安全相对路径。',
    }),
  /** 插件 config 的 JSON Schema，Studio 面板按此渲染。 */
  configSchema: z.record(z.string(), z.unknown()).optional(),
});

/**
 * 插件 manifest 运行时校验器。
 */
export const PluginManifestSchema = z
  .object({
    id: ReverseDomainPluginIdSchema,
    name: NonEmptyStringSchema,
    version: SemverStringSchema,
    author: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    license: NonEmptyStringSchema,
    minPlatformVersion: SemverStringSchema,
    permissions: z.array(PluginPermissionSchema),
    keywords: z.array(NonEmptyStringSchema).optional(),
    icon: NonEmptyStringSchema.optional(),
    homepage: NonEmptyStringSchema.optional(),
    repository: NonEmptyStringSchema.optional(),
    signature: z.string().optional(),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/, { message: '必须是 64 字符的 SHA-256 hex 字符串。' })
      .optional(),
    developerKeyFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/, { message: '必须是 64 字符的 SHA-256 hex 字符串。' })
      .optional(),
    wasmEntry: NonEmptyStringSchema.regex(/\.wasm$/i, {
      message: '必须指向 .wasm 文件路径。',
    }).optional(),
    sandbox: z
      .object({
        allowedHosts: z.array(z.string()).optional(),
        maxMemoryPages: z.number().int().positive().optional(),
        timeoutMs: z.number().int().positive().optional(),
      })
      .optional(),
    kind: PluginKindSchema.default('node'),
    runtime: PluginRuntimeSchema.optional(),
  })
  .strip();
