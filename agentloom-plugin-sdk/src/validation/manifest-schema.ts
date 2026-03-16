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
    wasmEntry: NonEmptyStringSchema.optional(),
    sandbox: z
      .object({
        allowedHosts: z.array(z.string()).optional(),
        maxMemoryPages: z.number().int().positive().optional(),
        timeoutMs: z.number().int().positive().optional(),
      })
      .optional(),
  })
  .strip();
