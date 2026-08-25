import { memo, useCallback, useEffect, useMemo } from 'react'
import { AlertCircle, Puzzle } from 'lucide-react'
import { normalizePluginConfigSchema } from '../../lib/pluginConfigSchema'
import type { CanvasNode, PluginNodeData } from '../../types'
import { DynamicConfigForm } from './DynamicConfigForm'

interface PluginConfigPanelProps {
  node: CanvasNode
  onConfigChange: (patch: Record<string, unknown>) => void
  onValidationChange: (hasErrors: boolean) => void
}

export const PluginConfigPanel = memo(function PluginConfigPanel({
  node,
  onConfigChange,
  onValidationChange,
}: PluginConfigPanelProps) {
  const data = node.data as PluginNodeData

  const configSchema = useMemo(
    () => normalizePluginConfigSchema(data.pluginConfigSchema),
    [data.pluginConfigSchema],
  )

  // 没有插件身份的节点执行时必然失败（worker 靠 pluginId + nodeType 定位实现）
  const hasIdentity = Boolean(data.pluginId) && Boolean(data.pluginNodeType)

  const handleApply = useCallback(
    (patch: Record<string, unknown>) => {
      const { config } = patch as { config?: Record<string, unknown> }
      onConfigChange({ pluginConfig: config ?? {} })
    },
    [onConfigChange],
  )

  const handleFormValidation = useCallback(
    (hasErrors: boolean) => {
      onValidationChange(!hasIdentity || hasErrors)
    },
    [hasIdentity, onValidationChange],
  )

  // 无配置表单时没人替我们上报，身份校验结果由本面板直接推给上层
  useEffect(() => {
    if (configSchema) return

    onValidationChange(!hasIdentity)
  }, [configSchema, hasIdentity, onValidationChange])

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="plugin-config-panel">
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

      {configSchema && (
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-2 block">
            插件配置
          </span>
          <DynamicConfigForm
            configSchema={configSchema}
            values={data.pluginConfig ?? {}}
            onApply={handleApply}
            onValidationChange={handleFormValidation}
          />
        </div>
      )}

      {!hasIdentity && (
        <div
          className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error"
          data-testid="plugin-config-identity-error"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {data.pluginId
              ? '此节点缺少插件节点类型，请从已安装的插件中重新拖入节点。'
              : '此节点需要从已安装的插件中选择，否则无法执行。'}
          </span>
        </div>
      )}
    </div>
  )
})
