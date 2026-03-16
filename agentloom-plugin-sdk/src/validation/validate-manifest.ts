import type { ValidationResult } from '../types';

import { PluginManifestSchema } from './manifest-schema';

/**
 * 校验任意输入是否为合法插件 manifest。
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const result = PluginManifestSchema.safeParse(manifest);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.map(String).join('.')}: ` : '';
    return `${path}${issue.message}`;
  });

  return { valid: false, errors };
}
