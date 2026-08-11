import { useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { Textarea } from '@/shared/ui/textarea'
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

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()

    createMutation.mutate(
      {
        name: trimmedName,
        description: trimmedDescription || undefined,
        createEmpty: true,
      },
      {
        onSuccess: () => {
          notify({
            title: '已创建',
            description: `工作区「${trimmedName}」创建成功。`,
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>创建工作区</DialogTitle>
          <DialogDescription>
            工作区用于持久化 Agent 的文件产出，创建后可在执行中挂载。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="ws-name">
              名称 <span className="text-error">*</span>
            </label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="工作区名称"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="ws-desc">
              描述
            </label>
            <Textarea
              id="ws-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选描述"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={!canCreate} onClick={handleCreate}>
            {createMutation.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
