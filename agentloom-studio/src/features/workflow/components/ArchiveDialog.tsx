import { memo, useCallback, type MouseEvent } from 'react'
import { Archive, Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { useArchiveWorkflow } from '../api/versionMutations'
import { useToast } from '@/shared/ui/toast'

interface ArchiveDialogProps {
  open: boolean
  workflowId: string
  onOpenChange: (open: boolean) => void
}

/** 归档是不可撤销的破坏性操作，走 AlertDialog；请求进行中保持打开并禁用按钮 */
export const ArchiveDialog = memo(function ArchiveDialog({
  open,
  workflowId,
  onOpenChange,
}: ArchiveDialogProps) {
  const archiveMutation = useArchiveWorkflow(workflowId)
  const { notify } = useToast()

  const handleConfirm = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      // 阻止 Action 默认关闭，等待请求结果再决定
      event.preventDefault()
      try {
        await archiveMutation.mutateAsync()
        notify({
          title: '归档成功',
          description: '工作流已归档，变为只读状态',
          variant: 'success',
        })
        onOpenChange(false)
      } catch {
        notify({
          title: '归档失败',
          description: '请稍后重试',
          variant: 'error',
        })
      }
    },
    [archiveMutation, notify, onOpenChange],
  )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="archive-dialog">
        <AlertDialogTitle>确认归档</AlertDialogTitle>
        <AlertDialogDescription>
          归档后工作流将变为只读，无法再编辑或发布。此操作不可撤销。
        </AlertDialogDescription>

        <AlertDialogFooter>
          <AlertDialogCancel
            data-testid="cancel-archive"
            disabled={archiveMutation.isPending}
          >
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => void handleConfirm(event)}
            disabled={archiveMutation.isPending}
            data-testid="confirm-archive"
          >
            {archiveMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Archive />
            )}
            确认归档
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
})
