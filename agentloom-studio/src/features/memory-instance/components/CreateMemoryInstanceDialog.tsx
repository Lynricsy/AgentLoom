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
import { useCreateMemoryInstance } from '../api/memoryInstanceMutations'
import { useToast } from '@/shared/ui/toast'
import { TagInput } from './TagInput'

interface CreateMemoryInstanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateMemoryInstanceDialog({
  open,
  onOpenChange,
}: CreateMemoryInstanceDialogProps) {
  const { notify } = useToast()
  const createMutation = useCreateMemoryInstance()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [validDomains, setValidDomains] = useState<string[]>(['core', 'notes'])
  const [coreMemoryUris, setCoreMemoryUris] = useState<string[]>(['core://agent'])
  const [systemPromptOverride, setSystemPromptOverride] = useState('')

  function resetForm() {
    setName('')
    setDescription('')
    setValidDomains(['core', 'notes'])
    setCoreMemoryUris(['core://agent'])
    setSystemPromptOverride('')
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
    const trimmedSystemPromptOverride = systemPromptOverride.trim()

    createMutation.mutate(
      {
        name: trimmedName,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        validDomains,
        coreMemoryUris,
        ...(trimmedSystemPromptOverride
          ? { systemPromptOverride: trimmedSystemPromptOverride }
          : {}),
      },
      {
        onSuccess: () => {
          notify({
            title: '已创建',
            description: `记忆实例「${trimmedName}」已成功创建。`,
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
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>创建记忆实例</DialogTitle>
          <DialogDescription>
            记忆实例保存 Agent 的长期图谱记忆，可按域划分并挂载核心记忆。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="mi-name">
              名称 <span className="text-error">*</span>
            </label>
            <Input
              id="mi-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="记忆实例名称"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="mi-desc">
              描述
            </label>
            <Textarea
              id="mi-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选描述"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="mi-domains">
              有效域
            </label>
            <p className="text-xs text-muted">输入域名后按 Enter 添加</p>
            <TagInput
              id="mi-domains"
              tags={validDomains}
              onChange={setValidDomains}
              placeholder="core, notes..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="mi-uris">
              核心记忆 URI
            </label>
            <p className="text-xs text-muted">输入 URI 后按 Enter 添加</p>
            <TagInput
              id="mi-uris"
              tags={coreMemoryUris}
              onChange={setCoreMemoryUris}
              placeholder="core://agent..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="mi-spo">
              系统提示词覆盖
            </label>
            <Textarea
              id="mi-spo"
              rows={3}
              value={systemPromptOverride}
              onChange={(e) => setSystemPromptOverride(e.target.value)}
              placeholder="可选：覆盖 Agent 默认系统提示词"
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
