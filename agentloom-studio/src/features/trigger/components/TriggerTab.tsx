import { useCallback, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { formatNumber } from '@/shared/lib/format'
import { Alert } from '@/shared/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
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

/** 与 TriggerCard 真实结构同高的加载骨架，避免加载完成时整列跳动 */
function TriggerCardSkeleton() {
  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-12 w-36 rounded-lg" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-[4.5rem] rounded-lg" />
        <Skeleton className="h-[4.5rem] rounded-lg" />
        <Skeleton className="h-[4.5rem] rounded-lg" />
      </div>
    </Card>
  )
}

export function TriggerTab({ workflowId, isPublished }: TriggerTabProps) {
  const { notify } = useToast()
  const triggerQuery = useTriggers(workflowId)
  const deleteMutation = useDeleteTrigger(workflowId)
  const toggleMutation = useToggleTrigger(workflowId)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null)
  const [historyTrigger, setHistoryTrigger] = useState<Trigger | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Trigger | null>(null)
  /** 弹窗退场期间目标已置空，用最近一次目标继续渲染文案，避免闪空 */
  const lastHistoryTriggerRef = useRef<Trigger | null>(null)
  if (historyTrigger) lastHistoryTriggerRef.current = historyTrigger
  const lastDeleteTargetRef = useRef<Trigger | null>(null)
  if (deleteTarget) lastDeleteTargetRef.current = deleteTarget

  const triggers = useMemo(() => triggerQuery.data?.data ?? [], [triggerQuery.data])
  const total = triggerQuery.data?.meta?.total ?? triggers.length

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleteMutation.isPending) {
      return
    }

    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      notify({
        title: '触发器已删除',
        description: `已删除「${deleteTarget.name}」。`,
        variant: 'success',
      })
      setDeleteTarget(null)
    } catch (error) {
      notify({
        title: '删除失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'error',
      })
    }
  }, [deleteMutation, deleteTarget, notify])

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
    <section className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            事件驱动触发器
          </p>
          <h2 className="text-base font-semibold text-foreground">触发器管理</h2>
          <p className="text-sm text-muted-foreground">
            当前共 {formatNumber(total)} 个触发器；已支持 Cron、Webhook、API Event 三种自动触发入口。
          </p>
        </div>

        {/* 未发布时的原因由下方 Alert 可见说明，不依赖 disabled 按钮上不会显示的 title */}
        <Button disabled={!isPublished} onClick={() => setIsCreateOpen(true)}>
          <Plus />
          添加触发器
        </Button>
      </div>

      {!isPublished ? (
        <Alert variant="warning">
          触发器仅能绑定到已发布的工作流版本。请先发布当前工作流，再启用自动调度入口。
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {triggerQuery.isLoading ? (
          <div className="space-y-3" data-testid="trigger-tab-loading">
            <TriggerCardSkeleton />
            <TriggerCardSkeleton />
          </div>
        ) : triggerQuery.isError ? (
          <EmptyState
            icon={TriangleAlert}
            tone="var(--color-error)"
            title="加载失败"
            description={
              triggerQuery.error instanceof Error
                ? triggerQuery.error.message
                : '无法加载触发器列表，请稍后重试。'
            }
          />
        ) : (
          <TriggerList
            workflowId={workflowId}
            triggers={triggers}
            onEdit={setEditingTrigger}
            onDelete={setDeleteTarget}
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
        trigger={historyTrigger ?? lastHistoryTriggerRef.current}
        open={!!historyTrigger}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryTrigger(null)
          }
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null)
          }
        }}
      >
        <AlertDialogContent data-testid="trigger-delete-dialog">
          <AlertDialogTitle>删除触发器</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除触发器「{lastDeleteTargetRef.current?.name}」吗？删除后该入口将立即失效。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                // 请求完成后再关闭；失败时保留弹窗便于重试
                event.preventDefault()
                void handleConfirmDelete()
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
