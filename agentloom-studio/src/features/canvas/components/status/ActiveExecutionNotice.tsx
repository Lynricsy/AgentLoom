import { memo, useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2, Pause, Play, XCircle } from 'lucide-react'
import { fadeInUp } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import { Button, buttonVariants } from '@/shared/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { useToast } from '@/shared/ui/toast'
import {
  useCancelExecution,
  useExecutionId,
  useExecutionProgress,
  useExecutionStatus,
  useIsExecutionActive,
} from '@/features/execution'
import { CANVAS_FLOATING_CLASS } from '../canvasChrome'

const ACTIVE_STATUS_META: Partial<
  Record<string, { label: string; icon: typeof Play; className: string }>
> = {
  pending: { label: '等待中', icon: Loader2, className: 'text-muted-foreground' },
  running: { label: '执行中', icon: Play, className: 'text-info' },
  paused: { label: '已暂停', icon: Pause, className: 'text-warning' },
}

/**
 * 画布正在跟踪的未结束执行（本次运行或重进画布恢复的执行）会禁用「运行」：
 * 标明是哪个执行、链接到执行页，并提供取消入口，避免被遗忘的暂停执行永久阻塞画布运行。
 */
export const ActiveExecutionNotice = memo(function ActiveExecutionNotice() {
  const executionId = useExecutionId()
  const isActive = useIsExecutionActive()
  const status = useExecutionStatus()
  const { completedSteps, totalSteps } = useExecutionProgress()
  const cancelMutation = useCancelExecution()
  const { notify } = useToast()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const meta = status ? ACTIVE_STATUS_META[status] : undefined
  const isVisible = isActive && !!executionId && !!meta
  const shortId = executionId?.slice(0, 8) ?? ''

  const handleConfirmCancel = useCallback(() => {
    if (!executionId) return
    cancelMutation.mutate(
      { executionId },
      {
        onSuccess: () => setIsConfirmOpen(false),
        onError: (error) => {
          notify({ variant: 'error', title: '取消执行失败', description: error.message })
        },
      },
    )
  }, [cancelMutation, executionId, notify])

  const Icon = meta?.icon

  return (
    <>
      <AnimatePresence initial={false}>
        {isVisible && executionId && meta && Icon ? (
          <motion.div
            key="active-execution-notice"
            {...fadeInUp}
            role="status"
            className={cn(
              CANVAS_FLOATING_CLASS,
              'pointer-events-auto flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 py-1 pl-3 pr-1 text-xs text-muted-foreground',
            )}
            data-testid="active-execution-notice"
          >
            <span className={cn('flex items-center gap-1 font-medium', meta.className)}>
              <Icon className={cn('size-3 shrink-0', status === 'pending' && 'animate-spin')} />
              {meta.label}
            </span>
            <span>
              执行
              <Link
                to="/executions/$executionId"
                params={{ executionId }}
                className={cn(buttonVariants({ variant: 'link', size: 'xs' }), 'h-auto px-1 font-mono')}
                data-testid="active-execution-link"
              >
                #{shortId}
              </Link>
              {totalSteps > 0 ? (
                <span className="tabular-nums">
                  ({completedSteps}/{totalSteps})
                </span>
              ) : null}
              ，结束前无法再次运行
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="text-error hover:bg-error/10 hover:text-error"
              onClick={() => setIsConfirmOpen(true)}
              data-testid="btn-cancel-active-execution"
            >
              <XCircle />
              取消执行
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AlertDialog
        open={isConfirmOpen && isVisible}
        onOpenChange={(open) => {
          if (!open) setIsConfirmOpen(false)
        }}
      >
        <AlertDialogContent data-testid="cancel-active-execution-dialog">
          <AlertDialogTitle>取消执行 #{shortId}？</AlertDialogTitle>
          <AlertDialogDescription>
            未完成和等待干预的步骤会被取消，已完成步骤的结果保留。取消后无法恢复。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>保留执行</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                handleConfirmCancel()
              }}
              data-testid="confirm-cancel-active-execution"
            >
              {cancelMutation.isPending ? '取消中…' : '取消执行'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})
