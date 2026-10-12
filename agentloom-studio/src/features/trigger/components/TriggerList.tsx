import { AnimatePresence, motion } from 'motion/react'
import { Zap } from 'lucide-react'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { fadeInUp } from '@/shared/lib/motion'
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
      <div data-testid={`trigger-empty-${workflowId}`}>
        <EmptyState
          icon={Zap}
          title="未配置触发器"
          description="当前工作流还没有配置自动触发器。发布后可新增 Cron、Webhook、API Event 三种自动触发入口。"
        />
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid={`trigger-list-${workflowId}`}>
      {/* 新增/删除触发器时卡片淡入淡出，其余卡片随 layout 平滑归位 */}
      <AnimatePresence initial={false}>
        {triggers.map((trigger) => (
          <motion.div key={trigger.id} layout {...fadeInUp}>
            <TriggerCard
              trigger={trigger}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggle={onToggle}
              onViewHistory={onViewHistory}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
