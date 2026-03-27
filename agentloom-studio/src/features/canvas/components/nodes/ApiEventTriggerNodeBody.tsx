import { memo } from 'react'
import { Radio, Filter } from 'lucide-react'

export const ApiEventTriggerNodeBody = memo(function ApiEventTriggerNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const eventSource = typeof config.eventSource === 'string' ? config.eventSource : ''
  const eventType = typeof config.eventType === 'string' ? config.eventType : ''
  const filterExpression = typeof config.filterExpression === 'string' ? config.filterExpression : ''

  const hasConfig = eventSource || eventType

  return (
    <div className="flex flex-col gap-1" data-testid="api-event-trigger-node-body">
      {hasConfig ? (
        <div className="flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="truncate text-[10px] text-muted-foreground">{eventSource}</span>
          <span className="text-[10px] text-muted-foreground/40">/</span>
          <span className="truncate text-[10px] text-muted-foreground">{eventType}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="text-[10px] text-muted-foreground/60">未配置</span>
        </div>
      )}
      {filterExpression && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Filter className="h-2.5 w-2.5" />
          <span>已配置过滤</span>
        </div>
      )}
    </div>
  )
})
