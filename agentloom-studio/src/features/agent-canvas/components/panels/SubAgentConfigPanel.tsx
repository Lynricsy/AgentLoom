import { memo, useCallback, useMemo, useState } from 'react'
import { Bot, Clock, AlertCircle } from 'lucide-react'
import { useAgentVersions } from '@/features/agent/api/agentQueries'
import type { AgentDefinition, AgentVersion } from '@/features/agent/types'
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
    (agent: AgentDefinition) => {
      const newAlias = generateAlias(agent.name)
      setAliasInput(newAlias)
      onApply({
        ...config,
        agentDefinitionId: agent.id,
        agentVersionId: null,
        alias: newAlias,
        _agentName: agent.name,
        _agentDescription: agent.description ?? '',
        _versionLabel: '',
      })
    },
    [config, onApply],
  )

  const handleAgentClear = useCallback(() => {
    setAliasInput('')
    onApply({
      ...config,
      agentDefinitionId: '',
      agentVersionId: null,
      alias: '',
      _agentName: '',
      _agentDescription: '',
      _versionLabel: '',
    })
  }, [config, onApply])

  const handleVersionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value
      if (val === '') {
        onApply({ ...config, agentVersionId: null, _versionLabel: '' })
        return
      }
      const ver = versions.find((v: AgentVersion) => v.id === val)
      onApply({
        ...config,
        agentVersionId: val,
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
      <section>
        <span className="mb-1.5 block text-xs font-medium text-neutral-300">
          Agent 选择 <span className="text-red-400">*</span>
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
        <section>
          <label
            htmlFor="sub-agent-version"
            className="mb-1.5 block text-xs font-medium text-neutral-300"
          >
            版本
          </label>
          <select
            id="sub-agent-version"
            value={parsed.agentVersionId ?? ''}
            onChange={handleVersionChange}
            disabled={versionsLoading}
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 outline-none focus:border-cyan-500/50 disabled:opacity-50"
          >
            <option value="">最新发布版</option>
            {versions.map((v: AgentVersion) => (
              <option key={v.id} value={v.id}>
                v{v.versionNumber}
                {v.label ? ` — ${v.label}` : ''}
                {v.publishedAt ? '' : ' (未发布)'}
              </option>
            ))}
          </select>
        </section>
      )}

      <section>
        <label
          htmlFor="sub-agent-alias"
          className="mb-1.5 block text-xs font-medium text-neutral-300"
        >
          别名 <span className="text-red-400">*</span>
        </label>
        <input
          id="sub-agent-alias"
          type="text"
          value={aliasInput}
          onChange={handleAliasChange}
          onBlur={handleAliasBlur}
          placeholder="例如: code-reviewer"
          className={`w-full rounded-md border bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none ${
            aliasError
              ? 'border-red-500/50 focus:border-red-500/70'
              : 'border-neutral-700 focus:border-cyan-500/50'
          }`}
        />
        {aliasError && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-red-400">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{aliasError}</span>
          </div>
        )}
        <p className="mt-1 text-[11px] text-neutral-500">
          唯一标识，用于在工作流中引用此子 Agent
        </p>
      </section>

      <section>
        <label
          htmlFor="sub-agent-timeout"
          className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-300"
        >
          <Clock className="h-3.5 w-3.5 text-neutral-400" />
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
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-700 accent-cyan-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
          />
          <span className="w-12 text-right text-xs tabular-nums text-neutral-300">
            {timeoutSec}s
          </span>
        </div>
      </section>

      {parsed._agentDescription && (
        <section>
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-300">
            <Bot className="h-3.5 w-3.5 text-neutral-400" />
            描述
          </span>
          <div className="rounded-md border border-neutral-700/50 bg-neutral-800/30 px-3 py-2">
            <p className="text-xs leading-relaxed text-neutral-400">
              {parsed._agentDescription}
            </p>
          </div>
        </section>
      )}
    </div>
  )
})
