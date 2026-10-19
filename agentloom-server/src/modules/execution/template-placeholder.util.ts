/**
 * `{{key}}` / `{{a.b.c}}` Handlebars 风格占位符：输入预处理器的模板模式与 HTTP 请求节点的 URL 共用同一写法。
 */
export const TEMPLATE_PLACEHOLDER_PATTERN = /\{\{([^}]+)\}\}/g;

/** 按点分路径取值；路径中途遇到非对象时返回 undefined。 */
export function resolveTemplatePath(data: unknown, path: string): unknown {
  let current: unknown = data;
  for (const part of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
