import { memo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Workflow } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>新建工作流</DialogTitle>
          <DialogDescription>创建一个新的自动化工作流</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wf-name">
                <Label>
                  名称 <span className="text-error">*</span>
                </Label>
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
              <label htmlFor="wf-desc">
                <Label>描述</Label>
              </label>
              <Textarea
                id="wf-desc"
                placeholder="可选，简要描述工作流的功能"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim() || createWorkflow.isPending}>
              {createWorkflow.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})
