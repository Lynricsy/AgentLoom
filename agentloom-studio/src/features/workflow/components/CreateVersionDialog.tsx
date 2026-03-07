import { memo, useCallback, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Save, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useCreateVersion } from '../api/versionMutations'
import { useToast } from '@/shared/ui/toast'

interface CreateVersionDialogProps {
  open: boolean
  workflowId: string
  onOpenChange: (open: boolean) => void
}

export const CreateVersionDialog = memo(function CreateVersionDialog({
  open,
  workflowId,
  onOpenChange,
}: CreateVersionDialogProps) {
  const [label, setLabel] = useState('')
  const createMutation = useCreateVersion(workflowId)
  const { notify } = useToast()

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      try {
        await createMutation.mutateAsync({
          label: label.trim() || undefined,
        })
        notify({
          title: '版本已保存',
          description: label.trim() ? `版本「${label.trim()}」已创建` : '新版本已创建',
          variant: 'success',
        })
        setLabel('')
        onOpenChange(false)
      } catch {
        notify({
          title: '保存版本失败',
          description: '请稍后重试',
          variant: 'error',
        })
      }
    },
    [label, createMutation, notify, onOpenChange],
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setLabel('')
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-surface p-6 shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
          data-testid="create-version-dialog"
        >
          <Dialog.Title className="text-base font-medium">保存版本</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            创建当前工作流的版本快照，便于后续回滚。
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4">
            <label htmlFor="version-label" className="text-sm font-medium">
              版本标签 <span className="text-muted-foreground">（可选）</span>
            </label>
            <input
              id="version-label"
              type="text"
              maxLength={255}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如：添加了审批节点"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="version-label-input"

            />

            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                  data-testid="cancel-create-version"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={createMutation.isPending}
                data-testid="confirm-create-version"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存版本
              </button>
            </div>
          </form>

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
