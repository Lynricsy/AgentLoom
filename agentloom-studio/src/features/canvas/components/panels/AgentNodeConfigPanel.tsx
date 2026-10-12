import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Brain, Check, Container, Copy, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'
import { listAgents, listAgentVersions } from '@/features/agent'
import type { AgentDefinitionSummary, AgentVersion } from '@/features/agent'
import type { AgentRuntimeMode } from '@/features/agent'
import { OptimizationSuggestionsPanel } from '@/features/optimization-suggestion'
import { useCanvasStore } from '../../stores/canvasStore'
import type { CanvasNode } from '../../types'
import { getWorkflowAgentInputPorts } from '../../types/nodeTypeRegistry'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'
import { formatDate } from '@/shared/lib/format'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { FormField } from '@/shared/components/form-field/FormField'

interface AgentNodeConfigPanelProps {
  node: CanvasNode
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

interface AgentConfig {
  selectedAgentId: string | null
  agentVersionId: string | null
  agentName: string | null
  agentRuntimeMode: AgentRuntimeMode | null
  versionLabel: string | null
  inputMapping: Record<string, string>
}

// 已废除的内联 Agent 节点（legacy `llm-agent`）会把这两个字段留在节点 data 上。
// 它们不再参与执行，面板只做只读展示，避免用户保存后彻底丢失原始配置。
interface LegacyInlineAgentConfig {
  systemPrompt: string | null
  model: string | null
}

function readLegacyString(
  runtimeView: readonly Record<string, unknown>[],
  keys: readonly string[],
): string | null {
  for (const source of runtimeView) {
    for (const key of keys) {
      const value = source[key]
      if (typeof value === 'string' && value.trim().length > 0) return value
    }
  }
  return null
}

function parseInputMapping(raw: unknown): Record<string, string> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') result[k] = v
  }
  return result
}

function parseAgentConfig(config: Record<string, unknown>): AgentConfig {
  return {
    selectedAgentId: typeof config.selectedAgentId === 'string' ? config.selectedAgentId : null,
    agentVersionId: typeof config.agentVersionId === 'string' ? config.agentVersionId : null,
    agentName: typeof config.agentName === 'string' ? config.agentName : null,
    agentRuntimeMode:
      config.agentRuntimeMode === 'sandbox' || config.agentRuntimeMode === 'no_sandbox'
        ? config.agentRuntimeMode
        : null,
    versionLabel: typeof config.versionLabel === 'string' ? config.versionLabel : null,
    inputMapping: parseInputMapping(config.inputMapping),
  }
}

// 顶层 node.data 优先、node.data.config 兜底：存量节点两处都可能落过值。
function readLegacyInlineConfig(data: Record<string, unknown>): LegacyInlineAgentConfig {
  const nested = data.config
  const runtimeView =
    nested != null && typeof nested === 'object' && !Array.isArray(nested)
      ? [data, nested as Record<string, unknown>]
      : [data]

  return {
    systemPrompt: readLegacyString(runtimeView, ['systemPrompt', 'system_prompt']),
    model: readLegacyString(runtimeView, ['model']),
  }
}

export const AgentNodeConfigPanel = memo(function AgentNodeConfigPanel({
  node,
  config,
  onApply,
}: AgentNodeConfigPanelProps) {
  const agentConfig = parseAgentConfig(config)
  // 画布尚未保存（新建工作流）时没有 workflowDefinitionId，节点级优化建议无从查询
  const workflowId = useCanvasStore((s) => s.workflowId)
  const { notify } = useToast()
  const legacyInline = useMemo(() => readLegacyInlineConfig(node.data), [node.data])

  const handleCopyLegacyPrompt = useCallback(async () => {
    if (!legacyInline.systemPrompt) return
    try {
      await navigator.clipboard?.writeText(legacyInline.systemPrompt)
      notify({ description: '系统提示词已复制，可粘贴到 text 节点', variant: 'success' })
    } catch {
      // 剪贴板不可用（无权限或非安全上下文）时静默降级，用户仍可手动选中复制
    }
  }, [legacyInline.systemPrompt, notify])

  const [agents, setAgents] = useState<AgentDefinitionSummary[]>([])
  const [versions, setVersions] = useState<AgentVersion[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const inputMappingEntries = useMemo(
    () => {
      const entries = Object.entries(agentConfig.inputMapping)
      return entries.length > 0 ? entries.map(([k, v]) => ({ key: k, value: v })) : []
    },
    [agentConfig.inputMapping],
  )

  useEffect(() => {
    let cancelled = false
    setLoadingAgents(true)
    listAgents({ status: 'published', pageSize: 100 })
      .then((res) => {
        if (!cancelled) setAgents(res.data)
      })
      .catch(() => {
        if (!cancelled) setAgents([])
      })
      .finally(() => {
        if (!cancelled) setLoadingAgents(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!agentConfig.selectedAgentId) {
      setVersions([])
      return
    }
    let cancelled = false
    setLoadingVersions(true)
    listAgentVersions(agentConfig.selectedAgentId, { pageSize: 50 })
      .then((res) => {
        if (!cancelled) {
          const published = res.data.filter((v) => v.publishedAt !== null)
          setVersions(published)
        }
      })
      .catch(() => {
        if (!cancelled) setVersions([])
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false)
      })
    return () => { cancelled = true }
  }, [agentConfig.selectedAgentId])

  const handleSelectAgent = useCallback(
    (agent: AgentDefinitionSummary) => {
      const latestVersion = agent.publishedVersionId
      const inputPorts = getWorkflowAgentInputPorts(agent.runtimeMode)
      onApply({
        config: {
          ...parseAgentConfig(config),
          selectedAgentId: agent.id,
          agentVersionId: latestVersion,
          agentName: agent.name,
          agentRuntimeMode: agent.runtimeMode,
          versionLabel: null,
        },
        selectedAgentId: agent.id,
        agentVersionId: latestVersion,
        agentRuntimeMode: agent.runtimeMode,
        inputPorts,
      })
    },
    [config, onApply],
  )

  const handleSelectVersion = useCallback(
    (version: AgentVersion) => {
      const current = parseAgentConfig(config)
      onApply({
        config: {
          ...current,
          agentVersionId: version.id,
          versionLabel: version.label || `v${version.versionNumber}`,
        },
        agentVersionId: version.id,
      })
    },
    [config, onApply],
  )

  const applyInputMapping = useCallback(
    (mapping: Record<string, string>) => {
      const current = parseAgentConfig(config)
      onApply({
        config: { ...current, inputMapping: mapping },
        inputMapping: mapping,
      })
    },
    [config, onApply],
  )

  const handleAddMappingRow = useCallback(() => {
    const current = parseAgentConfig(config).inputMapping
    const newKey = `field_${Object.keys(current).length}`
    applyInputMapping({ ...current, [newKey]: '' })
  }, [config, applyInputMapping])

  const handleRemoveMappingRow = useCallback(
    (key: string) => {
      const current = { ...parseAgentConfig(config).inputMapping }
      delete current[key]
      applyInputMapping(current)
    },
    [config, applyInputMapping],
  )

  const handleUpdateMappingKey = useCallback(
    (oldKey: string, newKey: string) => {
      const current = parseAgentConfig(config).inputMapping
      const entries = Object.entries(current)
      const updated: Record<string, string> = {}
      for (const [k, v] of entries) {
        updated[k === oldKey ? newKey : k] = v
      }
      applyInputMapping(updated)
    },
    [config, applyInputMapping],
  )

  const handleUpdateMappingValue = useCallback(
    (key: string, value: string) => {
      const current = parseAgentConfig(config).inputMapping
      applyInputMapping({ ...current, [key]: value })
    },
    [config, applyInputMapping],
  )

  const filteredAgents = searchQuery.trim()
    ? agents.filter((a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase())
      || (a.description ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
    )
    : agents

  useEffect(() => {
    if (!agentConfig.selectedAgentId) {
      return
    }

    const selectedAgent = agents.find((agent) => agent.id === agentConfig.selectedAgentId)
    if (!selectedAgent) {
      return
    }

    const expectedPorts = getWorkflowAgentInputPorts(selectedAgent.runtimeMode)
    const currentPortIds = node.data.inputPorts.map((port) => port.id)
    const expectedPortIds = expectedPorts.map((port) => port.id)
    const portShapeChanged =
      currentPortIds.length !== expectedPortIds.length
      || currentPortIds.some((portId, index) => portId !== expectedPortIds[index])

    if (!portShapeChanged && agentConfig.agentRuntimeMode === selectedAgent.runtimeMode) {
      return
    }

    onApply({
      config: {
        ...parseAgentConfig(config),
        agentRuntimeMode: selectedAgent.runtimeMode,
      },
      agentRuntimeMode: selectedAgent.runtimeMode,
      inputPorts: expectedPorts,
    })
  }, [agentConfig.agentRuntimeMode, agentConfig.selectedAgentId, agents, config, node.data.inputPorts, onApply])

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Brain className="size-4 shrink-0 text-type-model" />
        <Badge tone="var(--color-type-model)">Agent</Badge>
      </div>

      {/* Agent 选择器 */}
      <FormField label="选择 Agent" htmlFor="agent-search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="agent-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索已发布的 Agent…"
            className="pl-8 pr-3"
          />
        </div>
        <div className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {loadingAgents ? (
            <div role="status" className="space-y-2 p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
              <span className="sr-only">加载中…</span>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {searchQuery ? '未找到匹配的 Agent' : '暂无已发布的 Agent'}
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <Button
                variant="ghost"
                size="sm"
                key={agent.id}
                onClick={() => handleSelectAgent(agent)}
                aria-pressed={agentConfig.selectedAgentId === agent.id}
                className={cn(
                  'h-auto w-full flex-col items-stretch justify-start gap-0 whitespace-normal rounded-none px-3 py-2 text-left text-sm',
                  agentConfig.selectedAgentId === agent.id
                    ? 'bg-primary/10 font-medium hover:bg-primary/10'
                    : 'font-normal',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Brain className="size-3.5 shrink-0 text-type-model" />
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  <Badge variant="outline" size="sm" className="shrink-0">
                    {agent.runtimeMode === 'sandbox' ? '有沙箱' : '无沙箱'}
                  </Badge>
                  {agentConfig.selectedAgentId === agent.id ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : null}
                </div>
                {agent.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground pl-5.5">
                    {agent.description}
                  </p>
                )}
              </Button>
            ))
          )}
        </div>
      </FormField>

      {/* 遗留内联 Agent 配置（只读） */}
      {(legacyInline.systemPrompt || legacyInline.model) && (
        <div
          data-testid="agent-legacy-inline-config"
          className="space-y-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <div className="space-y-1">
              <p className="font-medium text-warning">
                旧版内联 Agent 配置（已废除，不再参与执行）
              </p>
              <p className="text-warning/80">
                下列内容来自旧的内联 Agent 节点，仅供查阅与迁移。
                请把系统提示词复制到一个 text 节点，再把它的输出连到本节点的「系统提示词」输入端口；
                模型由所绑定的 Agent Definition 决定。
              </p>
            </div>
          </div>

          {legacyInline.systemPrompt && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">系统提示词</span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleCopyLegacyPrompt}
                  className="text-warning hover:bg-warning/15 hover:text-warning"
                >
                  <Copy />
                  复制
                </Button>
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-warning/20 bg-background/60 p-2 font-mono text-2xs leading-relaxed text-foreground">
                {legacyInline.systemPrompt}
              </pre>
            </div>
          )}

          {legacyInline.model && (
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">模型</span>
              <span className="min-w-0 truncate font-mono text-2xs text-foreground" title={legacyInline.model}>
                {legacyInline.model}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 版本选择 */}
      {agentConfig.selectedAgentId && (
        <div>
          <div className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            当前 Agent 运行形态：
            <span className="ml-1 font-medium text-foreground">
              {agentConfig.agentRuntimeMode === 'no_sandbox' ? '无沙箱' : '有沙箱'}
            </span>
            {agentConfig.agentRuntimeMode === 'no_sandbox' && (
              <span className="ml-1">
                输入端口将移除{' '}
                <code className="rounded-xs bg-surface px-1 font-mono">sandbox-in</code>。
              </span>
            )}
          </div>
          <FormField label="版本" htmlFor="agent-version">
            {loadingVersions ? (
              <div role="status">
                <Skeleton className="h-9 w-full" />
                <span className="sr-only">加载版本…</span>
              </div>
            ) : (
              <Select
                value={agentConfig.agentVersionId ?? ''}
                onValueChange={(value) => {
                  const v = versions.find((ver) => ver.id === value)
                  if (v) handleSelectVersion(v)
                }}
                disabled={versions.length === 0}
              >
                <SelectTrigger id="agent-version" aria-label="版本">
                  <SelectValue
                    placeholder={
                      versions.length === 0 ? '暂无已发布版本' : '使用最新发布版本'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label || `v${v.versionNumber}`}
                      {v.publishedAt ? `（${formatDate(v.publishedAt)}）` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
      )}

      {/* Sandbox 覆盖提示 */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-xs">
        <Container className="mt-0.5 size-3.5 shrink-0 text-type-tool" />
        <p className="text-muted-foreground">
          连接 Sandbox 节点将覆盖 Agent 内置的沙箱配置。
        </p>
      </div>

      {/* 当前配置摘要 */}
      {agentConfig.selectedAgentId && (
        <Card className="space-y-2 p-3 text-xs">
          <p className="font-medium text-foreground">当前配置</p>
          <div className="space-y-1 text-muted-foreground">
            <p className="break-words">Agent：{agentConfig.agentName || '未知'}</p>
            {agentConfig.versionLabel && (
              <p className="break-words">版本：{agentConfig.versionLabel}</p>
            )}
          </div>
        </Card>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="input-mapping-add" className="block text-xs font-medium text-foreground">
            输入映射
          </label>
          <Button
            id="input-mapping-add"
            variant="ghost"
            size="xs"
            onClick={handleAddMappingRow}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus />
            添加
          </Button>
        </div>
        {inputMappingEntries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            暂无输入映射，点击「添加」定义字段绑定
          </p>
        ) : (
          <div className="space-y-2">
            {/* 行 key 用位置而非字段名：字段名正在被编辑，作 key 会每键重挂导致输入框失焦；
                重命名保持对象键顺序，因此位置在编辑期间稳定 */}
            {inputMappingEntries.map(({ key, value }, index) => (
              <div key={`mapping-row-${index}`} className="flex items-center gap-2">
                <Input
                  type="text"
                  value={key}
                  onChange={(e) => handleUpdateMappingKey(key, e.target.value)}
                  placeholder="字段名"
                  aria-label={`映射 ${index + 1} 字段名`}
                  className="h-7 w-2/5 px-2 text-xs"
                />
                <span className="shrink-0 text-xs text-muted-foreground">→</span>
                <Input
                  type="text"
                  value={value}
                  onChange={(e) => handleUpdateMappingValue(key, e.target.value)}
                  placeholder="来源表达式"
                  aria-label={`映射 ${index + 1} 来源表达式`}
                  className="h-7 min-w-0 flex-1 px-2 text-xs"
                />
                <Button
                  aria-label={`删除映射 ${key}`}
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleRemoveMappingRow(key)}
                  className="shrink-0 text-muted-foreground hover:bg-error/10 hover:text-error"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 节点级优化建议：Board 的「在画布中查看」深链最终落到这里 */}
      {workflowId ? (
        <div className="border-t border-border pt-4">
          <OptimizationSuggestionsPanel workflowDefinitionId={workflowId} nodeId={node.id} />
        </div>
      ) : null}
    </div>
  )
})
