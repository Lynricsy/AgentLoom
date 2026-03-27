import { memo } from 'react'
import { Clock } from 'lucide-react'

export const ScheduleTriggerNodeBody = memo(function ScheduleTriggerNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const cron = typeof config.cron === 'string' ? config.cron : ''
  const timezone = typeof config.timezone === 'string' ? config.timezone : 'UTC'

  return (
    <div className="flex flex-col gap-1" data-testid="schedule-trigger-node-body">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 shrink-0 text-warning" />
        {cron ? (
          <span className="truncate font-mono text-[10px] text-muted-foreground">{cron}</span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">未配置</span>
        )}
      </div>
      {cron && (
        <span className="w-fit rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {timezone}
        </span>
      )}
    </div>
  )
})
