import { memo, useCallback, useMemo } from 'react'
import { Play } from 'lucide-react'
import {
  parseManualTriggerConfig,
  buildManualTriggerOutputPorts,
  type ManualTriggerOutputField,
} from '../../types/trigger.types'
import { DynamicPortEditor, type DynamicPortEntry } from './DynamicPortEditor'

// ── ManualTriggerConfigPanel ─────────────────────────────────────

interface ManualTriggerConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

let nextFieldCounter = 0
const createFieldId = () => `field-${Date.now()}-${nextFieldCounter++}`
const createDefaultLabel = (index: number) => `参数 ${index + 1}`

export const ManualTriggerConfigPanel = memo(function ManualTriggerConfigPanel({
  config,
  onApply,
}: ManualTriggerConfigPanelProps) {
  const parsed = useMemo(() => parseManualTriggerConfig(config), [config])

  const portEntries: DynamicPortEntry[] = useMemo(
    () =>
      parsed.outputFields.map((field, i) => ({
        id: field.id,
        label: field.label || createDefaultLabel(i),
      })),
    [parsed.outputFields],
  )

  const handlePortsChange = useCallback(
    (ports: DynamicPortEntry[]) => {
      const nextFields: ManualTriggerOutputField[] = ports.map((port, i) => {
        // 保留已有字段的 type，新字段默认 text
        const existing = parsed.outputFields.find((f) => f.id === port.id)
        return {
          id: port.id,
          label: port.label || createDefaultLabel(i),
          type: existing?.type ?? 'text',
        }
      })

      const outputPorts = buildManualTriggerOutputPorts(nextFields)
      onApply({
        config: { ...config, outputFields: nextFields },
        outputPorts,
      })
    },
    [parsed.outputFields, config, onApply],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <Play className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">手动触发配置</span>
      </div>

      <p className="text-[10px] text-muted-foreground">
        定义工作流手动运行时需要填写的输入参数。每个参数对应一个输出端口。
      </p>

      {/* 输出端口编辑器 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-foreground">输出参数</p>
        <DynamicPortEditor
          ports={portEntries}
          onChange={handlePortsChange}
          minPorts={0}
          maxPorts={20}
          createPortId={createFieldId}
          createDefaultLabel={createDefaultLabel}
          addLabel="添加参数"
        />
      </div>

      {/* 配置摘要 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
        <p className="font-medium text-foreground">当前配置</p>
        <div className="flex flex-col gap-1 text-muted-foreground">
          <span>
            输出参数: {parsed.outputFields.length > 0
              ? `${parsed.outputFields.length} 个`
              : '无 (使用默认 payload)'}
          </span>
          {parsed.outputFields.length > 0 && (
            <span className="truncate">
              字段: {parsed.outputFields.map((f) => f.label).join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})
