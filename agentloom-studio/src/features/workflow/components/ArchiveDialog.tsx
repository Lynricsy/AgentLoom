import { memo, useCallback } from 'react'
import { AlertCircle, Archive, Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/shared/ui/dialog'
import { useArchiveWorkflow } from '../api/versionMutations'
import { useToast } from '@/shared/ui/toast'

interface ArchiveDialogProps {
  open: boolean
  workflowId: string
  onOpenChange: (open: boolean) => void
}

export const ArchiveDialog = memo(function ArchiveDialog({
  open,
  workflowId,
  onOpenChange,
}: ArchiveDialogProps) {
  const archiveMutation = useArchiveWorkflow(workflowId)
  const { notify } = useToast()

  const handleConfirm = useCallback(async () => {
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
  }, [archiveMutation, notify, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" data-testid="archive-dialog">
        <DialogBody className="flex items-start gap-3 pr-12 pt-6">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warning/10 text-warning"
          >
            <AlertCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <DialogTitle>确认归档</DialogTitle>
            <DialogDescription>
              归档后工作流将变为只读，无法再编辑或发布。此操作不可撤销。
            </DialogDescription>
          </div>
        </DialogBody>

        <DialogFooter className="border-t-0 pt-0">
          <DialogClose asChild>
            <Button type="button" variant="ghost" data-testid="cancel-archive">
              取消
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="bg-warning text-white hover:bg-warning/90"
            onClick={handleConfirm}
            disabled={archiveMutation.isPending}
            data-testid="confirm-archive"
          >
            {archiveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            确认归档
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
