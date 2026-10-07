import { memo, useCallback, useMemo, useState } from 'react'
import { Bot, Search, Check, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useAgentList } from '@/features/agent'
import type { AgentDefinitionSummary } from '@/features/agent'

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
        <div className="rounded-lg border border-border bg-muted p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <Bot className="mt-0.5 size-4 shrink-0 text-[var(--color-node-agent)]" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {selectedAgentName || selectedAgentId}
                </p>
                {selectedAgentDescription && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {selectedAgentDescription}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClear}
              className="shrink-0 text-subtle-foreground hover:text-foreground"
              aria-label="清除选择"
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground"
        />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索 Agent..."
          aria-label="搜索 Agent"
          className="h-8 pl-8 pr-3 text-xs"
        />
      </div>

      <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            加载中...
          </div>
        ) : agents.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {searchQuery ? '未找到匹配的 Agent' : '暂无已发布的 Agent'}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {agents.map((agent) => {
              const isSelected = agent.id === selectedAgentId
              return (
                <li key={agent.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelect(agent)}
                    className={cn(
                      'h-auto w-full flex-col items-stretch gap-0 whitespace-normal rounded-none px-3 py-2.5 text-left',
                      isSelected && 'bg-primary/10 hover:bg-primary/10',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <Bot className="shrink-0 text-muted-foreground" />
                        <span className="truncate text-xs font-medium text-foreground">
                          {agent.name}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="success" size="sm">
                          已发布
                        </Badge>
                        {isSelected && <Check className="text-primary" />}
                      </span>
                    </span>
                    {agent.description && (
                      <span className="mt-0.5 pl-5.5 text-2xs text-muted-foreground line-clamp-1">
                        {agent.description}
                      </span>
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
})
