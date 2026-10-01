/** RFC 9457 problem `type` 的唯一前缀；AllExceptionsFilter 与各模块 DomainException 共用 */
export const PROBLEM_TYPE_BASE = 'https://agentloom.dev/errors/';

/** 由 kebab-case slug 生成标准 problem type URI */
export function problemType(slug: string): string {
  return `${PROBLEM_TYPE_BASE}${slug}`;
}
