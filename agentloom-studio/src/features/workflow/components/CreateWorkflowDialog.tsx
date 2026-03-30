import { memo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Workflow, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { EmojiIconPicker } from '@/shared/components/emoji-icon-picker'
import { useCreateWorkflow } from '../api/workflowMutations'

interface CreateWorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const CreateWorkflowDialog = memo(function CreateWorkflowDialog({
  open,
  onOpenChange,
}: CreateWorkflowDialogProps) {
  const navigate = useNavigate()
  const createWorkflow = useCreateWorkflow()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState<string | null>(null)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName('')
      setDescription('')
      setIcon(null)
    }
    onOpenChange(nextOpen)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || createWorkflow.isPending) return

    try {
      const workflow = await createWorkflow.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon ?? undefined,
      })
      handleOpenChange(false)
      navigate({ to: '/workflows/$workflowId', params: { workflowId: workflow.id } })
    } catch {
      // mutation 错误由 TanStack Query 管理
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-border/60 bg-background shadow-xl',
            'p-6',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            'focus:outline-none',
          )}
        >
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-base font-semibold text-foreground">
                新建工作流
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                创建一个新的自动化工作流
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
              <X className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">关闭</span>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wf-name" className="text-sm font-medium text-foreground">
                名称 <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <EmojiIconPicker value={icon} onChange={setIcon} fallbackIcon={Workflow} />
                <Input
                  id="wf-name"
                  placeholder="输入工作流名称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="flex-1"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="wf-desc" className="text-sm font-medium text-foreground">
                描述
              </label>
              <textarea
                id="wf-desc"
                placeholder="可选，简要描述工作流的功能"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  取消
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!name.trim() || createWorkflow.isPending}>
                {createWorkflow.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                创建
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
