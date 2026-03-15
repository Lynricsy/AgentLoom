import { memo, useCallback, useMemo } from 'react'
import { GitFork, Plus, Trash2 } from 'lucide-react'
import type { CanvasNode } from '../../types'
import type { RoutingStrategy } from '../../types'
import { useCanvasActions } from '../../stores/canvasStore'
import { createPort } from '../../types/nodeTypeRegistry'

const STRATEGY_OPTIONS: { value: RoutingStrategy; label: string }[] = [
  { value: 'TOKEN_OPTIMIZED', label: 'Token 优化' },
  { value: 'COST_OPTIMIZED', label: '成本优化' },
  { value: 'QUALITY_FIRST', label: '质量优先' },
  { value: 'LATENCY_FIRST', label: '延迟优先' },
  { value: 'HISTORICAL_BEST', label: '历史最佳' },
  { value: 'FALLBACK_CHAIN', label: '回退链' },
]

const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  TOKEN_OPTIMIZED: '根据输入 token 数量选择上下文窗口最合适的模型',
  COST_OPTIMIZED: '选择预估成本最低的模型',
  QUALITY_FIRST: '选择质量排名最高的模型',
  LATENCY_FIRST: '选择平均延迟最低的模型',
  HISTORICAL_BEST: '根据历史执行数据选择表现最佳的模型',
  FALLBACK_CHAIN: '按优先级依次尝试，失败时切换到下一个模型',
}

const MIN_MODEL_PORTS = 2
const MAX_MODEL_PORTS = 10

interface SmartRoutingConfigPanelProps {
  node: CanvasNode
  onConfigChange: (patch: Record<string, unknown>) => void
}

export const SmartRoutingConfigPanel = memo(function SmartRoutingConfigPanel({
  node,
  onConfigChange,
}: SmartRoutingConfigPanelProps) {
  const { updateNodeData } = useCanvasActions()
  const strategy = (node.data.config?.strategy as RoutingStrategy) ?? 'QUALITY_FIRST'
  const tokenThreshold = (node.data.config?.tokenThreshold as number) ?? 4096
  const fallbackPriority = (node.data.config?.fallbackPriority as string[]) ?? []

  const modelInputPorts = useMemo(
    () => (node.data.inputPorts ?? []).filter((p) => p.schema.kind === 'model'),
    [node.data.inputPorts],
  )

  const handleStrategyChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onConfigChange({ strategy: e.target.value })
    },
    [onConfigChange],
  )

  const handleTokenThresholdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10)
      if (!isNaN(val) && val > 0) {
        onConfigChange({ tokenThreshold: val })
      }
    },
    [onConfigChange],
  )

  const handleAddPort = useCallback(() => {
    const currentPorts = node.data.inputPorts ?? []
    const modelPorts = currentPorts.filter((p) => p.schema.kind === 'model')
    if (modelPorts.length >= MAX_MODEL_PORTS) return
    const nextIndex = modelPorts.length + 1
    const newPort = createPort(
      `model-input-${nextIndex}`,
      `模型 ${nextIndex}`,
      'input',
      'model',
      { required: false },
    )
    updateNodeData(node.id, {
      inputPorts: [...currentPorts, newPort],
    })
  }, [node.id, node.data.inputPorts, updateNodeData])

  const handleRemovePort = useCallback(
    (portId: string) => {
      const currentPorts = node.data.inputPorts ?? []
      const modelPorts = currentPorts.filter((p) => p.schema.kind === 'model')
      if (modelPorts.length <= MIN_MODEL_PORTS) return
      updateNodeData(node.id, {
        inputPorts: currentPorts.filter((p) => p.id !== portId),
      })
    },
    [node.id, node.data.inputPorts, updateNodeData],
  )

  const handleMovePriority = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const newPriority = [...fallbackPriority]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= newPriority.length) return
      const temp = newPriority[index]!
      newPriority[index] = newPriority[targetIndex]!
      newPriority[targetIndex] = temp
      onConfigChange({ fallbackPriority: newPriority })
    },
    [fallbackPriority, onConfigChange],
  )

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="smart-routing-config-panel">
      <div className="flex items-center gap-2">
        <GitFork className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">智能路由配置</h3>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="strategy-select" className="text-xs font-medium text-muted-foreground">
          路由策略
        </label>
        <select
          id="strategy-select"
          data-testid="strategy-select"
          value={strategy}
          onChange={handleStrategyChange}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {STRATEGY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{STRATEGY_DESCRIPTIONS[strategy]}</p>
      </div>

      {strategy === 'TOKEN_OPTIMIZED' ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="token-threshold" className="text-xs font-medium text-muted-foreground">
            Token 阈值
          </label>
          <input
            id="token-threshold"
            data-testid="token-threshold-input"
            type="number"
            min={1}
            value={tokenThreshold}
            onChange={handleTokenThresholdChange}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      ) : null}

      {strategy === 'FALLBACK_CHAIN' && fallbackPriority.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">回退优先级</span>
          <ul className="flex flex-col gap-1" data-testid="fallback-priority-list">
            {fallbackPriority.map((modelId, index) => (
              <li
                key={modelId}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs"
              >
                <span className="font-mono text-muted-foreground">{index + 1}</span>
                <span className="flex-1 truncate">{modelId}</span>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => handleMovePriority(index, 'up')}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === fallbackPriority.length - 1}
                  onClick={() => handleMovePriority(index, 'down')}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  ↓
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          模型输入端口 ({modelInputPorts.length})
        </span>
        <ul className="flex flex-col gap-1">
          {modelInputPorts.map((port) => (
            <li
              key={port.id}
              className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs"
            >
              <span>{port.label}</span>
              {modelInputPorts.length > MIN_MODEL_PORTS ? (
                <button
                  type="button"
                  onClick={() => handleRemovePort(port.id)}
                  className="text-muted-foreground hover:text-destructive"
                  data-testid={`remove-port-${port.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {modelInputPorts.length < MAX_MODEL_PORTS ? (
          <button
            type="button"
            onClick={handleAddPort}
            data-testid="add-model-port"
            className="flex items-center gap-1 self-start rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Plus className="h-3 w-3" />
            添加模型端口
          </button>
        ) : null}
      </div>
    </div>
  )
})
