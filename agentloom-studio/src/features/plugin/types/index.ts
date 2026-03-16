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
  status: PluginStatus
  nodeDefinitions: PluginNodeDefinition[]
  createdAt: string
  updatedAt: string
}
