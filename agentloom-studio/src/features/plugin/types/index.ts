export type PluginStatus = 'registered' | 'active' | 'disabled' | 'error'

export interface PluginNodeDefinition {
  type: string
  label: string
  category: string
  description: string
  inputPorts: Array<{
    id: string
    label: string
    dataType: string
    required?: boolean
    description?: string
  }>
  outputPorts: Array<{
    id: string
    label: string
    dataType: string
    required?: boolean
    description?: string
  }>
  configSchema?: Record<string, unknown>
}

export interface PluginRecord {
  id: string
  pluginId: string
  name: string
  version: string
  author: string
  description: string | null
  license: string | null
  status: PluginStatus
  manifest: Record<string, unknown>
  nodeDefinitions: PluginNodeDefinition[]
  permissions: string[]
  metadata: Record<string, unknown> | null
  /** 乐观并发版本号，状态变更时必须回传 */
  occVersion: number
  createdAt: string
  updatedAt: string
}

export interface PluginListItem {
  id: string
  pluginId: string
  name: string
  version: string
  author: string
  description: string | null
  license: string | null
  status: PluginStatus
  nodeDefinitions: PluginNodeDefinition[]
  metadata: Record<string, unknown> | null
  /** 乐观并发版本号，状态变更时必须回传 */
  occVersion: number
  createdAt: string
  updatedAt: string
}

/** 插件来源：由 metadata.clonedFromMarketplace 是否存在推导 */
export type PluginOrigin = 'marketplace' | 'upload'
