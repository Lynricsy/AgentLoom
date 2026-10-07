import type { ValidationResult } from '../types';

import { PluginManifestSchema } from './manifest-schema';

/**
 * 校验任意输入是否为合法插件 manifest。
 *
 * 除 schema 外的跨字段规则：`kind === 'runtime'` 时必须声明 `runtime` 且不得声明 `wasmEntry`；
 * `kind === 'node'`（默认）维持原有规则。
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const result = PluginManifestSchema.safeParse(manifest);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.map(String).join('.')}: ` : '';
      return `${path}${issue.message}`;
    });

    return { valid: false, errors };
  }

  const errors: string[] = [];

  if (result.data.kind === 'runtime') {
    if (!result.data.runtime) {
      errors.push('runtime: kind 为 runtime 时必须声明 runtime 字段。');
    }

    if (result.data.wasmEntry !== undefined) {
      errors.push('wasmEntry: runtime 插件不得声明 wasmEntry。');
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, errors: [] };
}
