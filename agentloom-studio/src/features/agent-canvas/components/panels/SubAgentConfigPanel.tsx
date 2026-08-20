import { memo, useCallback, useMemo, useState } from 'react'
import { Bot, Clock, AlertCircle } from 'lucide-react'
import { useAgentVersions } from '@/features/agent/api/agentQueries'
import type { AgentDefinitionSummary, AgentVersion } from '@/features/agent/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import {
  useAgentCanvasStore,
  useAgentCanvasNodes,
} from '../../stores/agent-canvas.store'
import { AgentSearchPicker } from '../AgentSearchPicker'

interface SubAgentConfigPanelProps {
  config: Record<string, unknown>
  onApply: (config: Record<string, unknown>) => void
}

function parseSubAgentConfig(config: Record<string, unknown>) {
  return {
    agentDefinitionId:
      typeof config.agentDefinitionId === 'string'
        ? config.agentDefinitionId
        : '',
    agentVersionId:
      typeof config.agentVersionId === 'string'
        ? config.agentVersionId
        : null,
    alias: typeof config.alias === 'string' ? config.alias : '',
    maxTimeoutMs:
      typeof config.maxTimeoutMs === 'number' ? config.maxTimeoutMs : 300_000,
    _agentName:
      typeof config._agentName === 'string' ? config._agentName : '',
    _agentDescription:
      typeof config._agentDescription === 'string'
        ? config._agentDescription
        : '',
    _versionLabel:
      typeof config._versionLabel === 'string' ? config._versionLabel : '',
  }
}

/**
 * contracts 的 `AgentSubAgentRef.agentVersionId` 是可选字段而非可空字段，
 * “最新发布版”必须表达为键缺失，写入 `null` 会让 server 端 schema 校验失败。
 */
function withLatestVersion(
  config: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const { agentVersionId: _omitted, ...rest } = config
  return { ...rest, ...patch }
}

function generateAlias(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[^a-zA-Z]/, 'a')
    .slice(0, 32)
    .toLowerCase()
}

const ALIAS_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/

/**
 * “最新发布版”在语义上是一个真实可选项（对应 agentVersionId 键缺失），
 * 但 Radix Select 不接受 value=""，因此用哨兵值承载。
 */
const LATEST_VERSION_VALUE = '__latest__'

export const SubAgentConfigPanel = memo(function SubAgentConfigPanel({
  config,
  onApply,
}: SubAgentConfigPanelProps) {
  const parsed = parseSubAgentConfig(config)
  const currentAgentId = useAgentCanvasStore((s) => s.agentId)
  const nodes = useAgentCanvasNodes()

  const [aliasInput, setAliasInput] = useState(parsed.alias)

  const existingAliases = useMemo(() => {
    const set = new Set<string>()
    for (const node of nodes) {
      const nd = node.data as Record<string, unknown>
      if (nd.nodeType !== 'sub-agent') continue
      const c = (nd.config ?? {}) as Record<string, unknown>
      const a = typeof c.alias === 'string' ? c.alias : ''
      if (a && c.agentDefinitionId !== parsed.agentDefinitionId) {
        set.add(a.toLowerCase())
      }
    }
    return set
  }, [nodes, parsed.agentDefinitionId])

  const aliasError = useMemo(() => {
    if (!aliasInput) return ''
    if (!ALIAS_PATTERN.test(aliasInput)) {
      return '别名必须以字母开头，仅包含字母、数字、下划线和连字符'
    }
    if (existingAliases.has(aliasInput.toLowerCase())) {
      return '别名已存在'
    }
    return ''
  }, [aliasInput, existingAliases])

  const { data: versionsResponse, isLoading: versionsLoading } =
    useAgentVersions(parsed.agentDefinitionId, { pageSize: 50 })

  const versions = useMemo(
    () => versionsResponse?.data ?? [],
    [versionsResponse],
  )

  const handleAgentSelect = useCallback(
    (agent: AgentDefinitionSummary) => {
      const newAlias = generateAlias(agent.name)
      setAliasInput(newAlias)
      onApply(
        withLatestVersion(config, {
          agentDefinitionId: agent.id,
          alias: newAlias,
          _agentName: agent.name,
          _agentDescription: agent.description ?? '',
          _versionLabel: '',
        }),
      )
    },
    [config, onApply],
  )

  const handleAgentClear = useCallback(() => {
    setAliasInput('')
    onApply(
      withLatestVersion(config, {
        agentDefinitionId: '',
        alias: '',
        _agentName: '',
        _agentDescription: '',
        _versionLabel: '',
      }),
    )
  }, [config, onApply])

  const handleVersionChange = useCallback(
    (value: string) => {
      if (value === LATEST_VERSION_VALUE) {
        onApply(withLatestVersion(config, { _versionLabel: '' }))
        return
      }
      const ver = versions.find((v: AgentVersion) => v.id === value)
      onApply({
        ...config,
        agentVersionId: value,
        _versionLabel: ver
          ? `v${ver.versionNumber}${ver.label ? ` (${ver.label})` : ''}`
          : '',
      })
    },
    [config, onApply, versions],
  )

  const handleAliasChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setAliasInput(val)
      if (val && ALIAS_PATTERN.test(val) && !existingAliases.has(val.toLowerCase())) {
        onApply({ ...config, alias: val })
      }
    },
    [config, onApply, existingAliases],
  )

  const handleAliasBlur = useCallback(() => {
    if (aliasInput && !aliasError) {
      onApply({ ...config, alias: aliasInput })
    }
  }, [aliasInput, aliasError, config, onApply])

  const timeoutSec = Math.round(parsed.maxTimeoutMs / 1000)
  const handleTimeoutChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sec = Number(e.target.value)
      if (!Number.isNaN(sec) && sec >= 10 && sec <= 600) {
        onApply({ ...config, maxTimeoutMs: sec * 1000 })
      }
    },
    [config, onApply],
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">
          Agent 选择 <span className="text-error">*</span>
        </span>
        <AgentSearchPicker
          selectedAgentId={parsed.agentDefinitionId}
          excludeAgentId={currentAgentId ?? undefined}
          onSelect={handleAgentSelect}
          onClear={handleAgentClear}
          selectedAgentName={parsed._agentName}
          selectedAgentDescription={parsed._agentDescription}
        />
      </section>

      {parsed.agentDefinitionId && (
        <section className="flex flex-col gap-1.5">
          <label
            htmlFor="sub-agent-version"
            className="text-xs font-medium text-foreground"
          >
            版本
          </label>
          <Select
            value={parsed.agentVersionId ?? LATEST_VERSION_VALUE}
            onValueChange={handleVersionChange}
            disabled={versionsLoading}
          >
            <SelectTrigger
              id="sub-agent-version"
              aria-label="版本"
              className="h-8 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LATEST_VERSION_VALUE} className="text-xs">
                最新发布版
              </SelectItem>
              {versions.map((v: AgentVersion) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  v{v.versionNumber}
                  {v.label ? ` — ${v.label}` : ''}
                  {v.publishedAt ? '' : ' (未发布)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <label
          htmlFor="sub-agent-alias"
          className="text-xs font-medium text-foreground"
        >
          别名 <span className="text-error">*</span>
        </label>
        <input
          id="sub-agent-alias"
          type="text"
          value={aliasInput}
          onChange={handleAliasChange}
          onBlur={handleAliasBlur}
          placeholder="例如: code-reviewer"
          aria-invalid={aliasError ? true : undefined}
          className={`w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 ${
            aliasError
              ? 'border-error focus-visible:ring-error/30'
              : 'border-input focus-visible:ring-primary/30'
          }`}
        />
        {aliasError && (
          <p className="flex items-center gap-1 text-xs font-medium text-error">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{aliasError}</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          唯一标识，用于在工作流中引用此子 Agent
        </p>
      </section>

      <section className="flex flex-col gap-1.5">
        <label
          htmlFor="sub-agent-timeout"
          className="flex items-center gap-1.5 text-xs font-medium text-foreground"
        >
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          最大超时
        </label>
        <div className="flex items-center gap-3">
          <input
            id="sub-agent-timeout"
            type="range"
            min={10}
            max={600}
            step={10}
            value={timeoutSec}
            onChange={handleTimeoutChange}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          />
          <span className="w-12 text-right text-xs tabular-nums text-foreground">
            {timeoutSec}s
          </span>
        </div>
      </section>

      {parsed._agentDescription && (
        <section className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            描述
          </span>
          <div className="rounded-card border border-border bg-surface-elevated px-3 py-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {parsed._agentDescription}
            </p>
          </div>
        </section>
      )}
    </div>
  )
})
