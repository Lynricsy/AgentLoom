import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Brain, Container, Copy, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'
import { listAgents, listAgentVersions } from '@/features/agent/api/agentDefinitionApi'
import type { AgentDefinition, AgentVersion } from '@/features/agent/types'
import type { AgentRuntimeMode } from '@/features/agent/types/agentRuntimeMode'
import { OptimizationSuggestionsPanel } from '@/features/optimization-suggestion'
import { useCanvasStore } from '../../stores/canvasStore'
import type { CanvasNode } from '../../types'
import { getWorkflowAgentInputPorts } from '../../types/nodeTypeRegistry'

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

  const [agents, setAgents] = useState<AgentDefinition[]>([])
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
    (agent: AgentDefinition) => {
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
        <Brain className="h-4 w-4 text-type-model" />
        <span className="rounded-full bg-type-model/10 px-2 py-0.5 text-xs font-medium text-type-model">
          Agent
        </span>
      </div>

      {/* Agent 选择器 */}
      <div>
        <label
          htmlFor="agent-search"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          选择 Agent
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="agent-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索已发布的 Agent..."
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm"
          />
        </div>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border">
          {loadingAgents ? (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              加载中...
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {searchQuery ? '未找到匹配的 Agent' : '暂无已发布的 Agent'}
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <button
                type="button"
                key={agent.id}
                onClick={() => handleSelectAgent(agent)}
                className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                  agentConfig.selectedAgentId === agent.id
                    ? 'bg-accent/50 font-medium'
                    : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <Brain className="h-3.5 w-3.5 shrink-0 text-type-model" />
                  <span className="truncate">{agent.name}</span>
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {agent.runtimeMode === 'sandbox' ? '有沙箱' : '无沙箱'}
                  </span>
                </div>
                {agent.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground pl-5.5">
                    {agent.description}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 遗留内联 Agent 配置（只读） */}
      {(legacyInline.systemPrompt || legacyInline.model) && (
        <div
          data-testid="agent-legacy-inline-config"
          className="space-y-3 rounded-card border border-warning/30 bg-warning/10 p-3 text-xs"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
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
                <button
                  type="button"
                  onClick={handleCopyLegacyPrompt}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-warning transition-colors hover:bg-warning/15"
                >
                  <Copy className="h-3 w-3" />
                  复制
                </button>
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-warning/20 bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                {legacyInline.systemPrompt}
              </pre>
            </div>
          )}

          {legacyInline.model && (
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">模型</span>
              <span className="truncate font-mono text-[11px] text-foreground">
                {legacyInline.model}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 版本选择 */}
      {agentConfig.selectedAgentId && (
        <div>
          <div className="mb-2 rounded-md border border-border/60 bg-surface px-3 py-2 text-xs text-muted-foreground">
            当前 Agent 运行形态：
            <span className="ml-1 font-medium text-foreground">
              {agentConfig.agentRuntimeMode === 'no_sandbox' ? '无沙箱' : '有沙箱'}
            </span>
            {agentConfig.agentRuntimeMode === 'no_sandbox' && (
              <span className="ml-1">输入端口将移除 `sandbox-in`。</span>
            )}
          </div>
          <label
            htmlFor="agent-version"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            版本
          </label>
          {loadingVersions ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              加载版本...
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
                    {v.publishedAt ? ` (${new Date(v.publishedAt).toLocaleDateString()})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Sandbox 覆盖提示 */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-xs">
        <Container className="mt-0.5 h-3.5 w-3.5 shrink-0 text-type-tool" />
        <p className="text-muted-foreground">
          连接 Sandbox 节点将覆盖 Agent 内置的沙箱配置。
        </p>
      </div>

      {/* 当前配置摘要 */}
      {agentConfig.selectedAgentId && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
          <p className="font-medium text-foreground">当前配置</p>
          <div className="space-y-1 text-muted-foreground">
            <p>Agent: {agentConfig.agentName || '未知'}</p>
            {agentConfig.versionLabel && (
              <p>版本: {agentConfig.versionLabel}</p>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="input-mapping-add" className="block text-xs font-medium text-foreground">
            输入映射
          </label>
          <button
            id="input-mapping-add"
            type="button"
            onClick={handleAddMappingRow}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>
        {inputMappingEntries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            暂无输入映射，点击「添加」定义字段绑定
          </p>
        ) : (
          <div className="space-y-2">
            {inputMappingEntries.map(({ key, value }) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => handleUpdateMappingKey(key, e.target.value)}
                  placeholder="字段名"
                  className="w-2/5 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
                <span className="shrink-0 text-xs text-muted-foreground">→</span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleUpdateMappingValue(key, e.target.value)}
                  placeholder="来源表达式"
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveMappingRow(key)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 节点级优化建议：Board 的「去画布处理」深链最终落到这里 */}
      {workflowId ? (
        <div className="-mx-4 border-t border-border pt-1">
          <OptimizationSuggestionsPanel workflowDefinitionId={workflowId} nodeId={node.id} />
        </div>
      ) : null}
    </div>
  )
})
