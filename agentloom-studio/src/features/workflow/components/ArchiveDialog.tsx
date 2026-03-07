import { memo, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, Archive, Loader2, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-surface p-6 shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
          data-testid="archive-dialog"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <Dialog.Title className="text-base font-medium">确认归档</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                归档后工作流将变为只读，无法再编辑或发布。此操作不可撤销。
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                data-testid="cancel-archive"
              >
                取消
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
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
            </button>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
