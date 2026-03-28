import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useCreateWorkspace } from '../api/workspaceMutations'
import { useToast } from '@/shared/ui/toast'

interface CreateWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const { notify } = useToast()
  const createMutation = useCreateWorkspace()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  function resetForm() {
    setName('')
    setDescription('')
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  function handleCreate() {
    if (!name.trim()) return

    createMutation.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        createEmpty: true,
      },
      {
        onSuccess: () => {
          notify({
            title: '已创建',
            description: `工作区「${name.trim()}」已成功创建。`,
            variant: 'success',
          })
          handleOpenChange(false)
        },
        onError: (err) => {
          notify({
            title: '创建失败',
            description: err instanceof Error ? err.message : '请稍后重试。',
            variant: 'error',
          })
        },
      },
    )
  }

  const canCreate = name.trim().length > 0 && !createMutation.isPending

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="create-ws-desc"
          className="fixed left-1/2 top-1/2 z-50 flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-surface-elevated shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              创建工作区
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only" id="create-ws-desc">
            创建新的工作区
          </Dialog.Description>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="ws-name">
                名称 <span className="text-red-400">*</span>
              </label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="工作区名称"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="ws-desc">
                描述
              </label>
              <textarea
                id="ws-desc"
                rows={2}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选描述"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
            <Dialog.Close asChild>
              <Button variant="outline">取消</Button>
            </Dialog.Close>
            <Button disabled={!canCreate} onClick={handleCreate}>
              {createMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              创建
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
