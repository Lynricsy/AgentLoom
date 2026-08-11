import { memo, useCallback, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
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
          title: '快照已保存',
          description: label.trim() ? `快照「${label.trim()}」已创建` : '新快照已创建',
          variant: 'success',
        })
        setLabel('')
        onOpenChange(false)
      } catch {
        notify({
          title: '保存快照失败',
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" data-testid="create-version-dialog">
        <DialogHeader>
          <DialogTitle>保存快照</DialogTitle>
          <DialogDescription>
            创建当前工作流的草稿快照，便于后续回滚或发布。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-1.5">
            <label htmlFor="version-label">
              <Label>
                快照标签 <span className="text-muted">（可选）</span>
              </Label>
            </label>
            <Input
              id="version-label"
              type="text"
              maxLength={255}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如：添加了审批节点"
              data-testid="version-label-input"
            />
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" data-testid="cancel-create-version">
                取消
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="confirm-create-version"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存快照
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})
