/**
 * Manifest 校验结果。
 */
export type ValidationResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: string[] };

export * from './execution';
export * from './manifest';
export * from './node';
export * from './plugin';
export * from './port';
