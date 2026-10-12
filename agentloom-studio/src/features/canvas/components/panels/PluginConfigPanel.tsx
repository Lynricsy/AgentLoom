import { memo, useCallback, useEffect, useMemo } from 'react'
import { Puzzle } from 'lucide-react'
import { Alert } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Card } from '@/shared/ui/card'
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
      <Card className="flex items-start gap-3 p-3">
        <div className="rounded-md bg-[var(--color-node-plugin)]/15 p-2">
          <Puzzle className="size-5 text-[var(--color-node-plugin)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="break-words text-sm font-medium">{data.pluginName || '未选择插件'}</h4>
          {data.pluginId && (
            <p className="mt-0.5 break-all text-xs text-muted-foreground">{data.pluginId}</p>
          )}
          {data.pluginVersion && (
            <Badge size="sm" tone="var(--color-node-plugin)" className="mt-1">
              v{data.pluginVersion}
            </Badge>
          )}
        </div>
      </Card>

      {data.pluginNodeType && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">节点类型</span>
          <p className="mt-1 break-all text-sm">{data.pluginNodeType}</p>
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
        <Alert variant="error" data-testid="plugin-config-identity-error">
          {data.pluginId
            ? '此节点缺少插件节点类型，请从已安装的插件中重新拖入节点。'
            : '此节点需要从已安装的插件中选择，否则无法执行。'}
        </Alert>
      )}
    </div>
  )
})
