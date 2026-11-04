/** tsup `loader: { '.py': 'text' }` 与 vitest 的 py-text 插件把 .py 文件内联为字符串默认导出 */
declare module '*.py' {
  const text: string;
  export default text;
}
