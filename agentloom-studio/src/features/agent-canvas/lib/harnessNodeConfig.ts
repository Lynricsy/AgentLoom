/**
 * harness / runtime-plugin 节点的共享常量与配置解析。
 * 节点主体、配置面板与画布 store 的连线守卫共用，避免句柄名与字段名各写一份。
 */

export const HARNESS_NODE_TYPE = 'harness'

/** harness 节点接收 runtime-plugin 的输入句柄 */
export const HARNESS_PLUGINS_INPUT_HANDLE = 'plugins-in'
/** agent-main 接收 harness 的输入句柄 */
export const AGENT_MAIN_HARNESS_INPUT_HANDLE = 'harness-in'

/** 与服务端 RUNTIME_PLUGIN_NPM_NAME_PATTERN 同款的 npm 包名校验 */
export const RUNTIME_PLUGIN_NPM_NAME_PATTERN =
  /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
/** npm 包名最大长度（与服务端 RUNTIME_PLUGIN_NPM_SPEC_MAX 一致） */
export const RUNTIME_PLUGIN_NPM_NAME_MAX = 214

export type RuntimePluginSource = 'package' | 'npm'

export interface HarnessNodeConfig {
  profilePatch: string
}

export interface RuntimePluginNodeConfig {
  source: RuntimePluginSource
  runtimePluginId: string
  pluginName: string
  pluginVersion: string
  configSchema: Record<string, unknown> | null
  pluginConfig: Record<string, unknown>
  npmName: string
  npmVersion: string
  enabled: boolean
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 普通对象（非数组、非 null）类型守卫 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseHarnessNodeConfig(
  config: Record<string, unknown> | undefined,
): HarnessNodeConfig {
  return { profilePatch: readString(config?.profilePatch) }
}

export function parseRuntimePluginNodeConfig(
  config: Record<string, unknown> | undefined,
): RuntimePluginNodeConfig {
  return {
    source: config?.source === 'npm' ? 'npm' : 'package',
    runtimePluginId: readString(config?.runtimePluginId),
    pluginName: readString(config?.pluginName),
    pluginVersion: readString(config?.pluginVersion),
    configSchema: isPlainRecord(config?.configSchema) ? config.configSchema : null,
    pluginConfig: isPlainRecord(config?.pluginConfig) ? config.pluginConfig : {},
    npmName: readString(config?.npmName),
    npmVersion: readString(config?.npmVersion),
    enabled: config?.enabled !== false,
  }
}

export function isValidRuntimePluginNpmName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= RUNTIME_PLUGIN_NPM_NAME_MAX &&
    RUNTIME_PLUGIN_NPM_NAME_PATTERN.test(name)
  )
}

/** runtime-plugin 节点的展示名：package 用 `name@version`，npm 用 `npmName@npmVersion`；未配置返回空串 */
export function formatRuntimePluginLabel(config: RuntimePluginNodeConfig): string {
  if (config.source === 'npm') {
    if (!config.npmName) return ''
    return config.npmVersion
      ? `${config.npmName}@${config.npmVersion}`
      : config.npmName
  }
  if (!config.runtimePluginId) return ''
  const name = config.pluginName || config.runtimePluginId
  return config.pluginVersion ? `${name}@${config.pluginVersion}` : name
}

interface HarnessConnectionEnds {
  sourceNodeType: string | undefined
  targetNodeType: string | undefined
  targetHandle: string | null | undefined
}

/**
 * harness 连线规则：harness-out 与 agent-main.harness-in 都是 json 端口，
 * 端口类型不足以区分（input-preprocessor 也走 json），因此两端都要显式限定：
 * harness 只能连 agent-main.harness-in，agent-main.harness-in 只接 harness。
 */
export function isHarnessConnectionAllowed({
  sourceNodeType,
  targetNodeType,
  targetHandle,
}: HarnessConnectionEnds): boolean {
  const targetsAgentMainHarness =
    targetNodeType === 'agent-main' &&
    targetHandle === AGENT_MAIN_HARNESS_INPUT_HANDLE
  if (sourceNodeType === HARNESS_NODE_TYPE) return targetsAgentMainHarness
  return !targetsAgentMainHarness
}
