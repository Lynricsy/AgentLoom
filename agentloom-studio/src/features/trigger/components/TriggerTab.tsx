import { useCallback, useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import {
  useDeleteTrigger,
  useToggleTrigger,
  useTriggers,
} from '../api/triggerQueries'
import type { Trigger } from '../types'
import { TriggerCreateDialog } from './TriggerCreateDialog'
import { TriggerHistoryDialog } from './TriggerHistoryDialog'
import { TriggerList } from './TriggerList'

interface TriggerTabProps {
  workflowId: string
  isPublished: boolean
}

export function TriggerTab({ workflowId, isPublished }: TriggerTabProps) {
  const { notify } = useToast()
  const triggerQuery = useTriggers(workflowId)
  const deleteMutation = useDeleteTrigger(workflowId)
  const toggleMutation = useToggleTrigger(workflowId)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null)
  const [historyTrigger, setHistoryTrigger] = useState<Trigger | null>(null)

  const triggers = useMemo(() => triggerQuery.data?.data ?? [], [triggerQuery.data])
  const total = triggerQuery.data?.meta?.total ?? triggers.length

  const handleDeleteTrigger = useCallback(
    async (trigger: Trigger) => {
      if (deleteMutation.isPending) {
        return
      }

      const shouldDelete = window.confirm(`确认删除触发器「${trigger.name}」吗？`)

      if (!shouldDelete) {
        return
      }

      try {
        await deleteMutation.mutateAsync(trigger.id)
        notify({
          title: '触发器已删除',
          description: `已删除「${trigger.name}」。`,
          variant: 'success',
        })
      } catch (error) {
        notify({
          title: '删除失败',
          description: error instanceof Error ? error.message : '请稍后重试。',
          variant: 'error',
        })
      }
    },
    [deleteMutation, notify],
  )

  const handleToggleTrigger = useCallback(
    async (trigger: Trigger) => {
      if (toggleMutation.isPending) {
        return
      }

      try {
        const updated = await toggleMutation.mutateAsync(trigger.id)
        notify({
          title: updated.isEnabled ? '触发器已启用' : '触发器已停用',
          description: `「${updated.name}」状态已更新。`,
          variant: 'success',
        })
      } catch (error) {
        notify({
          title: '状态切换失败',
          description: error instanceof Error ? error.message : '请稍后重试。',
          variant: 'error',
        })
      }
    },
    [notify, toggleMutation],
  )

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border/70 bg-surface/95 p-4 shadow-xl backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            事件驱动触发器
          </p>
          <h2 className="text-lg font-semibold text-foreground">触发器管理</h2>
          <p className="text-sm text-muted-foreground">
            当前共 {total} 个触发器；已支持 Cron、Webhook、API Event 三种自动触发入口。
          </p>
        </div>

        <Button
          className="gap-1.5"
          disabled={!isPublished}
          title={isPublished ? '新增触发器' : '请先发布工作流后再新增触发器'}
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          添加触发器
        </Button>
      </div>

      {!isPublished ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          触发器仅能绑定到已发布的工作流版本。请先发布当前工作流，再启用自动调度入口。
        </div>
      ) : null}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {triggerQuery.isLoading ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border/70 bg-background/30">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载触发器...
            </div>
          </div>
        ) : triggerQuery.isError ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 px-6 text-center">
            <div>
              <p className="text-base font-medium text-rose-100">加载失败</p>
              <p className="mt-2 text-sm text-rose-200/80">
                {triggerQuery.error instanceof Error
                  ? triggerQuery.error.message
                  : '无法加载触发器列表，请稍后重试。'}
              </p>
            </div>
          </div>
        ) : (
          <TriggerList
            workflowId={workflowId}
            triggers={triggers}
            onEdit={setEditingTrigger}
            onDelete={(trigger) => void handleDeleteTrigger(trigger)}
            onToggle={(trigger) => void handleToggleTrigger(trigger)}
            onViewHistory={setHistoryTrigger}
          />
        )}
      </div>

      <TriggerCreateDialog
        workflowId={workflowId}
        open={isCreateOpen || !!editingTrigger}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false)
            setEditingTrigger(null)
          }
        }}
        trigger={editingTrigger}
      />

      <TriggerHistoryDialog
        workflowId={workflowId}
        trigger={historyTrigger}
        open={!!historyTrigger}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryTrigger(null)
          }
        }}
      />
    </section>
  )
}
