import { memo, useCallback, useMemo, useState } from 'react'
import { Bot, Search, Check, X } from 'lucide-react'
import { useAgentList } from '@/features/agent/api/agentQueries'
import type { AgentDefinitionSummary } from '@/features/agent/types'

interface AgentSearchPickerProps {
  selectedAgentId: string
  excludeAgentId?: string | null
  onSelect: (agent: AgentDefinitionSummary) => void
  onClear: () => void
  selectedAgentName?: string
  selectedAgentDescription?: string
}

export const AgentSearchPicker = memo(function AgentSearchPicker({
  selectedAgentId,
  excludeAgentId,
  onSelect,
  onClear,
  selectedAgentName,
  selectedAgentDescription,
}: AgentSearchPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const { data: agentsResponse, isLoading } = useAgentList({
    search: searchQuery || undefined,
    pageSize: 50,
    status: 'published',
  })

  const agents = useMemo(() => {
    const all = agentsResponse?.data ?? []
    return all.filter((a) => {
      if (excludeAgentId && a.id === excludeAgentId) return false
      return !!a.publishedVersionId
    })
  }, [agentsResponse, excludeAgentId])

  const handleSelect = useCallback(
    (agent: AgentDefinitionSummary) => {
      onSelect(agent)
      setSearchQuery('')
    },
    [onSelect],
  )

  return (
    <div className="flex flex-col gap-2">
      {selectedAgentId && (
        <div className="rounded-md border border-neutral-700 bg-neutral-800/50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-200 truncate">
                  {selectedAgentName || selectedAgentId}
                </p>
                {selectedAgentDescription && (
                  <p className="mt-1 text-xs text-neutral-400 line-clamp-2">
                    {selectedAgentDescription}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 rounded p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300 cursor-pointer"
              aria-label="清除选择"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索 Agent..."
          className="w-full rounded-md border border-neutral-700 bg-neutral-800 py-1.5 pl-8 pr-3 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-cyan-500/50"
        />
      </div>

      <div className="max-h-52 overflow-y-auto rounded-md border border-neutral-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-xs text-neutral-500">
            加载中...
          </div>
        ) : agents.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-neutral-500">
            {searchQuery ? '未找到匹配的 Agent' : '暂无已发布的 Agent'}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-700/50">
            {agents.map((agent) => {
              const isSelected = agent.id === selectedAgentId
              return (
                <li key={agent.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(agent)}
                    className={`w-full cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-neutral-700/30 ${
                      isSelected ? 'bg-cyan-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Bot className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                        <span className="truncate text-xs font-medium text-neutral-200">
                          {agent.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">
                          已发布
                        </span>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-cyan-400" />
                        )}
                      </div>
                    </div>
                    {agent.description && (
                      <p className="mt-0.5 pl-5.5 text-[11px] text-neutral-500 line-clamp-1">
                        {agent.description}
                      </p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
})
