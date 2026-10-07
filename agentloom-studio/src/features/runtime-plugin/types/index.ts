/** runtime 插件状态，与服务端 runtime_plugin_status 枚举一致 */
export type RuntimePluginStatus = 'registered' | 'active' | 'disabled'

/**
 * runtime 插件记录，对应服务端 RuntimePluginResponseSchema。
 * 服务端不下发 storageKey / signature / bundlePatch。
 */
export interface RuntimePluginRecord {
  id: string
  /** manifest.id（reverse-domain） */
  pluginId: string
  name: string
  version: string
  author: string
  description: string | null
  license: string | null
  status: RuntimePluginStatus
  /** 插件声明的 config JSON Schema（manifest.runtime.configSchema） */
  configSchema: Record<string, unknown> | null
  sizeBytes: number
  /** 包内容 SHA-256（hex） */
  contentHash: string
  installedBy: string | null
  /** 乐观并发版本号，状态变更时必须回传 */
  occVersion: number
  createdAt: string
  updatedAt: string
}

export interface RuntimePluginListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: RuntimePluginStatus
}
