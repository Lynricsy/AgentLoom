import { memo, useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Switch } from '@/shared/ui/switch'
import type { BlockDefinition, BlockNodeData, CanvasNodeData } from '../../types'

interface ReusableBlockPanelProps {
  data: CanvasNodeData
  onApply: (patch: Record<string, unknown>) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBlockDefinition(value: unknown): value is BlockDefinition {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    Array.isArray(value.inputPorts) &&
    Array.isArray(value.outputPorts)
  )
}

function isBlockNodeData(data: CanvasNodeData): data is BlockNodeData {
  return (
    data.nodeType === 'reusable-block' &&
    typeof data.blockName === 'string' &&
    typeof data.isExpanded === 'boolean' &&
    isBlockDefinition(data.blockDefinition)
  )
}

function PortList({
  title,
  ports,
}: {
  title: string
  ports: Array<{ id: string; label: string; dataType: string }>
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-foreground">{title}</h4>
      {ports.length === 0 ? (
        <p className="rounded-md bg-surface-elevated px-3 py-2 text-xs text-muted-foreground">
          无暴露端口
        </p>
      ) : (
        <ul className="space-y-1">
          {ports.map((port) => (
            <li
              key={port.id}
              className="flex items-center justify-between rounded-md bg-surface-elevated px-2 py-1 text-xs"
            >
              <span className="text-foreground">{port.label}</span>
              <span className="text-muted">{port.dataType}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const ReusableBlockPanel = memo(function ReusableBlockPanel({
  data,
  onApply,
}: ReusableBlockPanelProps) {
  const blockData = isBlockNodeData(data) ? data : null
  const [blockName, setBlockName] = useState(blockData?.blockName ?? '')
  const [description, setDescription] = useState(blockData?.description ?? '')

  useEffect(() => {
    if (!blockData) {
      setBlockName('')
      setDescription('')
      return
    }

    setBlockName(blockData.blockName)
    setDescription(blockData.description ?? '')
  }, [blockData])

  if (!blockData) {
    return null
  }

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <span className="rounded-full bg-muted/70 px-2 py-0.5 text-xs font-medium text-foreground">
          Reusable Block
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="reusable-block-name"
          className="text-xs font-medium text-foreground"
        >
          块名称
        </label>
        <Input
          id="reusable-block-name"
          aria-label="块名称"
          value={blockName}
          onChange={(event) => {
            const nextValue = event.target.value
            setBlockName(nextValue)
            onApply({
              label: nextValue,
              blockName: nextValue,
            })
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="reusable-block-description"
          className="text-xs font-medium text-foreground"
        >
          描述
        </label>
        <Textarea
          id="reusable-block-description"
          aria-label="描述"
          rows={3}
          className="resize-none"
          value={description}
          onChange={(event) => {
            const nextValue = event.target.value
            setDescription(nextValue)
            onApply({ description: nextValue })
          }}
        />
      </div>

      <div className="rounded-card border border-border bg-surface-elevated p-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">内部节点数</span>
          <span className="font-medium text-foreground">{blockData.blockDefinition.nodes.length} 个节点</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-muted-foreground">内部连线数</span>
          <span className="font-medium text-foreground">{blockData.blockDefinition.edges.length} 条连线</span>
        </div>
      </div>

      <PortList title="输入端口" ports={blockData.inputPorts} />
      <PortList title="输出端口" ports={blockData.outputPorts} />

      <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface-elevated px-3 py-2">
        <label htmlFor="reusable-block-expanded" className="text-sm font-medium text-foreground">
          查看内部图
        </label>
        <Switch
          id="reusable-block-expanded"
          aria-label="查看内部图"
          checked={blockData.isExpanded}
          onCheckedChange={(checked) => onApply({ isExpanded: checked })}
        />
      </div>
    </div>
  )
})
