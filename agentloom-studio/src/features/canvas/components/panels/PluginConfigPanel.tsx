import { memo, type ReactNode } from 'react'
import { Puzzle } from 'lucide-react'
import type { CanvasNode, PluginNodeData } from '../../types'

interface PluginConfigPanelProps {
  node: CanvasNode
  onConfigChange: (patch: Record<string, unknown>) => void
}

function renderConfigFields(
  schema: Record<string, unknown>,
  config: Record<string, unknown> | undefined,
  onConfigChange: (patch: Record<string, unknown>) => void,
): ReactNode {
  const properties = schema.properties
  if (!properties || typeof properties !== 'object') return null

  return Object.entries(properties as Record<string, Record<string, unknown>>).map(
    ([key, fieldSchema]) => {
      const fieldId = `plugin-config-${key}`
      return (
        <div key={key}>
          <label htmlFor={fieldId} className="text-xs font-medium block mb-1">
            {String(fieldSchema?.title ?? key)}
          </label>
          {fieldSchema?.description != null && (
            <p className="text-[10px] text-muted-foreground mb-1">
              {String(fieldSchema.description)}
            </p>
          )}
          <input
            id={fieldId}
            type="text"
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
            value={String(config?.[key] ?? '')}
            onChange={(e) => {
              const newConfig = { ...config, [key]: e.target.value }
              onConfigChange({ pluginConfig: newConfig })
            }}
          />
        </div>
      )
    },
  )
}

export const PluginConfigPanel = memo(function PluginConfigPanel({
  node,
  onConfigChange,
}: PluginConfigPanelProps) {
  const data = node.data as PluginNodeData

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <div className="rounded-md bg-purple-100 p-2 dark:bg-purple-900/30">
          <Puzzle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium">{data.pluginName || '未选择插件'}</h4>
          {data.pluginId && (
            <p className="text-xs text-muted-foreground mt-0.5">{data.pluginId}</p>
          )}
          {data.pluginVersion && (
            <span className="inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 mt-1">
              v{data.pluginVersion}
            </span>
          )}
        </div>
      </div>

      {data.pluginNodeType && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">节点类型</span>
          <p className="text-sm mt-1">{data.pluginNodeType}</p>
        </div>
      )}

      {data.pluginConfigSchema && Object.keys(data.pluginConfigSchema).length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-2 block">插件配置</span>
          <div className="space-y-3">
            {renderConfigFields(data.pluginConfigSchema, data.pluginConfig, onConfigChange)}
          </div>
        </div>
      )}

      {!data.pluginId && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          <Puzzle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p>此节点需要从已安装的插件中选择</p>
        </div>
      )}
    </div>
  )
})
