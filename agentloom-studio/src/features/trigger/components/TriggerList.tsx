import { TriggerCard } from './TriggerCard'
import type { Trigger } from '../types'

interface TriggerListProps {
  workflowId: string
  triggers: Trigger[]
  onEdit: (trigger: Trigger) => void
  onDelete: (trigger: Trigger) => void
  onToggle: (trigger: Trigger) => void
  onViewHistory: (trigger: Trigger) => void
}

export function TriggerList({
  workflowId,
  triggers,
  onEdit,
  onDelete,
  onToggle,
  onViewHistory,
}: TriggerListProps) {
  if (triggers.length === 0) {
    return (
      <div
        className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/40 px-6 text-center"
        data-testid={`trigger-empty-${workflowId}`}
      >
        <h3 className="text-base font-medium text-foreground">No triggers configured</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          当前工作流还没有配置自动触发器。发布后可新增 Cron、Webhook、API Event 三种自动触发入口。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid={`trigger-list-${workflowId}`}>
      {triggers.map((trigger) => (
        <TriggerCard
          key={trigger.id}
          trigger={trigger}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          onViewHistory={onViewHistory}
        />
      ))}
    </div>
  )
}
