/** studio.Dockerfile 以 `__<NAME>__` 占位符构建、容器启动时 sed 替换的变量 */
export type RuntimeEnvName =
  | 'VITE_API_BASE_URL'
  | 'VITE_AUTOSAVE_DEBOUNCE_MS'
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_ANON_KEY'

/**
 * 读取运行时可替换的 VITE_* 变量。
 *
 * 按变量名动态索引 `import.meta.env`，构建产物保留整张 env 字面量表（含占位符），
 * 调用方对返回值做的 Number()/URL 等计算才不会在构建期被常量折叠。
 */
export function readRuntimeEnv(name: RuntimeEnvName): string | undefined {
  const env: Partial<Record<RuntimeEnvName, string>> = import.meta.env
  return env[name]
}
