import { memo, useCallback, useMemo } from 'react'
import {
  GitFork,
  Plus,
  Trash2,
  Shuffle,
  RefreshCw,
  ListChecks,
  Brain,
  ArrowDownUp,
  ScatterChart,
  Network,
  Trophy,
  Database,
  Puzzle,
  AlertCircle,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import type { CanvasNode } from '../../types'
import type { RoutingStrategy } from '../../types'
import { useCanvasActions, useCanvasEdges, useCanvasNodes } from '../../stores/canvasStore'
import { createPort } from '../../types/portSchema'
import {
  STRATEGY_META,
  STRATEGY_CATEGORY_COLORS,
  STRATEGY_CATEGORY_BG,
  STRATEGY_CATEGORY_LABELS,
  getStrategyMeta,
} from '@/features/smart-routing'
import type {
  StrategyName,
  StrategyCategory,
  ProviderHealthRecord,
  ProviderHealthState,
  JsonSchemaProperty,
} from '@/features/smart-routing'
import { useProviderHealth, useConfigSchema, useStrategies } from '@/features/smart-routing'
import { useUsableChatModels } from '@/features/llm'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/utils'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shuffle,
  RefreshCw,
  ListChecks,
  Brain,
  ArrowDownUp,
  ScatterChart,
  Network,
  Trophy,
  Database,
  Puzzle,
}

/** 从 STRATEGY_META 键中获取 fallback 策略名列表（API 不可用时使用） */
const FALLBACK_STRATEGY_NAMES: StrategyName[] = Object.keys(STRATEGY_META) as StrategyName[]

function isRoutingStrategy(value: unknown): value is RoutingStrategy {
  return FALLBACK_STRATEGY_NAMES.includes(value as StrategyName)
}

const MIN_MODEL_PORTS = 2
const MAX_MODEL_PORTS = 10

const CATEGORY_ORDER: StrategyCategory[] = ['simple', 'ml', 'rag', 'plugin']

/** llm_as_router 的回退字段由专用控件编辑，不走通用 SchemaField（fallbackRules 为规则数组，面板内不提供编辑） */
const LLM_ROUTER_DEDICATED_FIELDS = new Set(['fallbackModelId', 'fallbackRules'])

/** Select 不接受空字符串作为选项值，用哨兵表示“不设置回退模型” */
const NO_FALLBACK_MODEL = '__none__'

interface FallbackModelOption {
  id: string
  label: string
}

function getNextModelPortIndex(portIds: string[]): number {
  const currentMax = portIds.reduce((max, portId) => {
    const match = /^model-in-(\d+)$/.exec(portId)
    return match ? Math.max(max, Number(match[1])) : max
  }, -1)
  return currentMax + 1
}

const HEALTH_STATUS_STYLES: Record<
  ProviderHealthState,
  { bg: string; text: string; label: string }
> = {
  healthy: { bg: 'bg-success/15', text: 'text-success', label: '正常' },
  degraded: { bg: 'bg-warning/15', text: 'text-warning', label: '降级' },
  open: { bg: 'bg-error/15', text: 'text-error', label: '断路' },
}

function computeHealthSummary(healthData: ProviderHealthRecord[]) {
  const counts: Record<ProviderHealthState, number> = { healthy: 0, degraded: 0, open: 0 }
  for (const h of healthData) {
    counts[h.status]++
  }
  return counts
}

interface SchemaFieldProps {
  name: string
  schema: JsonSchemaProperty
  value: unknown
  onChange: (key: string, val: unknown) => void
}

const SchemaField = memo(function SchemaField({ name, schema, value, onChange }: SchemaFieldProps) {
  const fieldId = `strategy-param-${name}`
  const label = schema.title ?? name
  const description = schema.description

  if (schema.enum && schema.enum.length > 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
          {label}
        </label>
        <Select
          value={String(value ?? schema.default ?? '')}
          onValueChange={(next) => {
            onChange(name, next)
          }}
        >
          <SelectTrigger id={fieldId} data-testid={fieldId} aria-label={label}>
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {schema.enum.map((v) => (
              <SelectItem key={String(v)} value={String(v)}>
                {String(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
    )
  }

  if (schema.type === 'boolean') {
    const checked = typeof value === 'boolean' ? value : (schema.default as boolean) ?? false
    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={fieldId}
          className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground"
        >
          <Checkbox
            id={fieldId}
            data-testid={fieldId}
            checked={checked}
            onCheckedChange={(next) => onChange(name, next === true)}
          />
          {label}
        </label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
    )
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    const numVal = typeof value === 'number' ? value : (schema.default as number) ?? undefined
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
          {label}
        </label>
        <Input
          id={fieldId}
          type="number"
          data-testid={fieldId}
          value={numVal ?? ''}
          min={schema.minimum}
          max={schema.maximum}
          step={schema.type === 'integer' ? 1 : 0.01}
          onChange={(e) => {
            const v = e.target.value === '' ? undefined : Number(e.target.value)
            onChange(name, v)
          }}
        />
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
    )
  }

  const strVal = typeof value === 'string' ? value : (schema.default as string) ?? ''
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
        {label}
      </label>
      <Input
        id={fieldId}
        type="text"
        data-testid={fieldId}
        value={strVal}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  )
})

interface SmartRoutingConfigPanelProps {
  node: CanvasNode
  onConfigChange: (patch: Record<string, unknown>) => void
}

export const SmartRoutingConfigPanel = memo(function SmartRoutingConfigPanel({
  node,
  onConfigChange,
}: SmartRoutingConfigPanelProps) {
  const { updateNodeData } = useCanvasActions()

  const { data: strategies, isLoading: isStrategiesLoading } = useStrategies()

  // server 的策略名是自由字符串（插件可注册新策略），分组按 string 收集，
  // 显示时用 getStrategyMeta 查已知元数据、未知则回落到原始名。
  const strategyNamesByCategory: Record<StrategyCategory, string[]> = useMemo(() => {
    const groups: Record<StrategyCategory, string[]> = {
      simple: [],
      ml: [],
      rag: [],
      plugin: [],
    }
    if (strategies && strategies.length > 0) {
      for (const s of strategies) {
        groups[s.category]?.push(s.name)
      }
    } else {
      for (const name of FALLBACK_STRATEGY_NAMES) {
        const meta = STRATEGY_META[name]
        groups[meta.category]?.push(name)
      }
    }
    return groups
  }, [strategies])

  const strategy: RoutingStrategy = isRoutingStrategy(node.data.strategy)
    ? node.data.strategy
    : 'random'
  const strategyConfig = (node.data.strategyConfig as Record<string, unknown>) ?? {}
  const meta = getStrategyMeta(strategy)

  const modelInputPorts = useMemo(
    () => (node.data.inputPorts ?? []).filter((p) => p.dataType === 'model'),
    [node.data.inputPorts],
  )

  const fallbackPriority = useMemo(() => {
    const validPortIds = new Set(modelInputPorts.map((port) => port.id))
    const explicitPriority = Array.isArray(node.data.fallbackPriority)
      ? node.data.fallbackPriority.filter(
          (portId): portId is string => typeof portId === 'string' && validPortIds.has(portId),
        )
      : []
    const remainingPortIds = modelInputPorts
      .map((port) => port.id)
      .filter((portId) => !explicitPriority.includes(portId))
    return [...explicitPriority, ...remainingPortIds]
  }, [modelInputPorts, node.data.fallbackPriority])

  const portLabelById = useMemo(
    () => new Map(modelInputPorts.map((port) => [port.id, port.label])),
    [modelInputPorts],
  )

  const isLlmRouter = strategy === 'llm_as_router'
  const canvasNodes = useCanvasNodes()
  const canvasEdges = useCanvasEdges()
  const { data: usableModels } = useUsableChatModels({ enabled: isLlmRouter })

  // 回退模型只在候选内才生效：优先列出接入模型端口的 LLM 节点所选模型；
  // 画布上尚未接入（或不在工作流画布中）时退回账号内可用的对话模型
  const fallbackModelOptions = useMemo<FallbackModelOption[]>(() => {
    if (!isLlmRouter) return []
    const modelPortIds = new Set(modelInputPorts.map((port) => port.id))
    const nodesById = new Map(canvasNodes.map((canvasNode) => [canvasNode.id, canvasNode]))
    const modelNameById = new Map((usableModels ?? []).map((model) => [model.id, model.name]))
    const connected: FallbackModelOption[] = []
    for (const edge of canvasEdges) {
      if (edge.target !== node.id || !edge.targetHandle || !modelPortIds.has(edge.targetHandle)) {
        continue
      }
      const sourceNode = nodesById.get(edge.source)
      const modelConfigId = sourceNode?.data.llmConfigId
      if (typeof modelConfigId !== 'string' || !modelConfigId) continue
      if (connected.some((option) => option.id === modelConfigId)) continue
      connected.push({
        id: modelConfigId,
        label: modelNameById.get(modelConfigId) ?? sourceNode?.data.label ?? modelConfigId,
      })
    }
    if (connected.length > 0) return connected
    return (usableModels ?? []).map((model) => ({ id: model.id, label: model.name }))
  }, [canvasEdges, canvasNodes, isLlmRouter, modelInputPorts, node.id, usableModels])

  const fallbackModelId =
    typeof strategyConfig.fallbackModelId === 'string' ? strategyConfig.fallbackModelId : ''

  const { data: healthData } = useProviderHealth()
  const { data: configSchema } = useConfigSchema(strategy as StrategyName)
  const healthList = healthData ?? []
  const healthSummary = useMemo(() => computeHealthSummary(healthList), [healthList])

  const handleStrategyChange = useCallback(
    (value: string) => {
      const nextStrategy = value as RoutingStrategy
      const patch: Record<string, unknown> = {
        strategy: nextStrategy,
        strategyConfig: {},
      }
      if (nextStrategy === 'fallback_chain') {
        patch.fallbackPriority = fallbackPriority
      }
      onConfigChange(patch)
    },
    [fallbackPriority, onConfigChange],
  )

  const handleConfigParamChange = useCallback(
    (key: string, val: unknown) => {
      onConfigChange({
        strategyConfig: { ...strategyConfig, [key]: val },
      })
    },
    [strategyConfig, onConfigChange],
  )

  const handleFallbackModelChange = useCallback(
    (value: string) => {
      const nextConfig = { ...strategyConfig }
      if (value === NO_FALLBACK_MODEL) {
        delete nextConfig.fallbackModelId
      } else {
        nextConfig.fallbackModelId = value
      }
      onConfigChange({ strategyConfig: nextConfig })
    },
    [strategyConfig, onConfigChange],
  )

  const handleAddPort = useCallback(() => {
    const currentPorts = node.data.inputPorts ?? []
    const modelPorts = currentPorts.filter((p) => p.dataType === 'model')
    if (modelPorts.length >= MAX_MODEL_PORTS) return
    const nextIndex = getNextModelPortIndex(modelPorts.map((port) => port.id))
    const newPort = createPort(`model-in-${nextIndex}`, `模型 ${nextIndex + 1}`, 'input', 'model', {
      required: false,
    })
    const nextInputPorts = [...currentPorts, newPort]
    updateNodeData(node.id, {
      inputPorts: nextInputPorts,
      fallbackPriority: nextInputPorts
        .filter((port) => port.dataType === 'model')
        .map((port) => port.id),
    })
  }, [node.id, node.data.inputPorts, updateNodeData])

  const handleRemovePort = useCallback(
    (portId: string) => {
      const currentPorts = node.data.inputPorts ?? []
      const modelPorts = currentPorts.filter((p) => p.dataType === 'model')
      if (modelPorts.length <= MIN_MODEL_PORTS) return
      const nextInputPorts = currentPorts.filter((p) => p.id !== portId)
      updateNodeData(node.id, {
        inputPorts: nextInputPorts,
        fallbackPriority: fallbackPriority.filter((id) => id !== portId),
      })
    },
    [fallbackPriority, node.id, node.data.inputPorts, updateNodeData],
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

  const schemaProperties = configSchema?.properties ?? {}
  const schemaPropertyEntries = Object.entries(schemaProperties).filter(
    ([key]) => !(isLlmRouter && LLM_ROUTER_DEDICATED_FIELDS.has(key)),
  )
  const hasStrategyOptions = CATEGORY_ORDER.some(
    (cat) => strategyNamesByCategory[cat].length > 0,
  )

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="smart-routing-config-panel">
      <div className="flex items-center gap-2">
        <GitFork className="size-4 shrink-0 text-primary" />
        <h3 className="text-xs font-medium text-foreground">智能路由配置</h3>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="strategy-select" className="text-xs font-medium text-foreground">
          路由策略
        </label>
        <Select
          value={strategy}
          onValueChange={handleStrategyChange}
          disabled={isStrategiesLoading || !hasStrategyOptions}
        >
          <SelectTrigger id="strategy-select" data-testid="strategy-select" aria-label="路由策略">
            <SelectValue
              placeholder={isStrategiesLoading ? '策略加载中…' : '暂无可用策略'}
            />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_ORDER.map((cat) => {
              const names = strategyNamesByCategory[cat]
              if (names.length === 0) return null
              return (
                <SelectGroup key={cat} data-testid={`strategy-group-${cat}`}>
                  <SelectLabel>{STRATEGY_CATEGORY_LABELS[cat]}</SelectLabel>
                  {names.map((name) => {
                    const m = getStrategyMeta(name)
                    return (
                      <SelectItem key={name} value={name}>
                        {m?.displayName ?? name}
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              )
            })}
          </SelectContent>
        </Select>
        {meta ? (
          <div className="flex items-center gap-1.5">
            {ICON_MAP[meta.icon] ? (
              (() => {
                const Icon = ICON_MAP[meta.icon]!
                return <Icon className={cn('size-3 shrink-0', STRATEGY_CATEGORY_COLORS[meta.category])} />
              })()
            ) : null}
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium',
                STRATEGY_CATEGORY_BG[meta.category],
                STRATEGY_CATEGORY_COLORS[meta.category],
              )}
            >
              {STRATEGY_CATEGORY_LABELS[meta.category]}
            </span>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">{meta?.description ?? ''}</p>
      </div>

      {healthList.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">Provider 状态</span>
          <div className="flex items-center gap-2" data-testid="provider-health-summary">
            {(Object.entries(healthSummary) as [ProviderHealthState, number][]).map(
              ([status, count]) =>
                count > 0 ? (
                  <span
                    key={status}
                    data-testid={`provider-health-badge-${status}`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium',
                      HEALTH_STATUS_STYLES[status].bg,
                      HEALTH_STATUS_STYLES[status].text,
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {count} {HEALTH_STATUS_STYLES[status].label}
                  </span>
                ) : null,
            )}
          </div>
          {healthSummary.degraded > 0 || healthSummary.open > 0 ? (
            <div className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-2xs text-warning">
              <AlertCircle className="mt-0.5 size-3 shrink-0" />
              <span>
                {healthSummary.open > 0
                  ? `${healthSummary.open} 个 Provider 已断路`
                  : `${healthSummary.degraded} 个 Provider 性能降级`}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {schemaPropertyEntries.length > 0 ? (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-medium text-foreground">策略参数</span>
          {schemaPropertyEntries.map(([key, propSchema]) => (
            <SchemaField
              key={key}
              name={key}
              schema={propSchema}
              value={strategyConfig[key]}
              onChange={handleConfigParamChange}
            />
          ))}
        </div>
      ) : null}

      {isLlmRouter ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="llm-router-fallback-model" className="text-xs font-medium text-foreground">
            回退模型
          </label>
          <Select
            value={fallbackModelId || NO_FALLBACK_MODEL}
            onValueChange={handleFallbackModelChange}
          >
            <SelectTrigger
              id="llm-router-fallback-model"
              data-testid="llm-router-fallback-model"
              aria-label="回退模型"
            >
              <SelectValue placeholder="不设置" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FALLBACK_MODEL}>不设置（按规则回退，无匹配取首个候选）</SelectItem>
              {fallbackModelId && !fallbackModelOptions.some((option) => option.id === fallbackModelId) ? (
                <SelectItem value={fallbackModelId}>{fallbackModelId}（不在候选中）</SelectItem>
              ) : null}
              {fallbackModelOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            路由模型超时、出错或返回无效结果时使用；须为候选模型之一，否则按回退规则选择。
          </p>
        </div>
      ) : null}

      {strategy === 'fallback_chain' ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">回退优先级</span>
          <ul className="flex flex-col gap-1" data-testid="fallback-priority-list">
            {fallbackPriority.map((portId, index) => (
              <li
                key={portId}
                className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-xs"
              >
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{portLabelById.get(portId) ?? portId}</span>
                <Button
                  aria-label="上移优先级"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === 0}
                  onClick={() => handleMovePriority(index, 'up')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronUp />
                </Button>
                <Button
                  aria-label="下移优先级"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === fallbackPriority.length - 1}
                  onClick={() => handleMovePriority(index, 'down')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">
          模型输入端口（{modelInputPorts.length}）
        </span>
        <ul className="flex flex-col gap-1">
          {modelInputPorts.map((port) => (
            <li
              key={port.id}
              className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate" title={port.label}>
                {port.label}
              </span>
              {modelInputPorts.length > MIN_MODEL_PORTS ? (
                <Button
                  aria-label={`删除端口 ${port.label}`}
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleRemovePort(port.id)}
                  className="text-muted-foreground hover:bg-error/10 hover:text-error"
                  data-testid={`remove-port-${port.id}`}
                >
                  <Trash2 />
                </Button>
              ) : (
                // 端口数到下限时不可删除：保留同尺寸占位，避免增删端口时整列表行高跳变
                <span aria-hidden className="size-7 shrink-0" />
              )}
            </li>
          ))}
        </ul>
        {modelInputPorts.length < MAX_MODEL_PORTS ? (
          <Button
            variant="outline"
            size="xs"
            onClick={handleAddPort}
            data-testid="add-model-port"
            className="self-start border-dashed text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Plus />
            添加模型端口
          </Button>
        ) : null}
      </div>
    </div>
  )
})
