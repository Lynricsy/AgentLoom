import { useState, useEffect } from 'react'
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
import { Skeleton } from '@/shared/ui/skeleton'
import { Textarea } from '@/shared/ui/textarea'
import { useToast } from '@/shared/ui/toast'
import { useMemoryInstanceDetail } from '../api/memoryInstanceQueries'
import { useUpdateMemoryInstance } from '../api/memoryInstanceMutations'
import { TagInput } from './TagInput'
import type { MemoryInstance } from '../types'

interface EditMemoryInstanceDialogProps {
  instance: MemoryInstance | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditMemoryInstanceDialog({
  instance,
  open,
  onOpenChange,
}: EditMemoryInstanceDialogProps) {
  const { notify } = useToast()
  const updateMutation = useUpdateMemoryInstance()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [validDomains, setValidDomains] = useState<string[]>([])
  const [coreMemoryUris, setCoreMemoryUris] = useState<string[]>([])
  const [systemPromptOverride, setSystemPromptOverride] = useState('')

  const { data: detail, isLoading: detailLoading } = useMemoryInstanceDetail(
    instance?.id ?? '',
    { enabled: open && Boolean(instance?.id) },
  )

  // Sync form when detail loads
  const prevId = detail?.id
  useEffect(() => {
    if (detail) {
      setName(detail.name)
      setDescription(detail.description ?? '')
      setValidDomains(detail.validDomains)
      setCoreMemoryUris(detail.coreMemoryUris)
      setSystemPromptOverride(detail.systemPromptOverride ?? '')
    }
  }, [prevId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on close
  useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setValidDomains([])
      setCoreMemoryUris([])
      setSystemPromptOverride('')
    }
  }, [open])

  function handleSave() {
    if (!instance) return

    updateMutation.mutate(
      {
        id: instance.id,
        payload: {
          name: name.trim(),
          description: description.trim() || null,
          validDomains,
          coreMemoryUris,
          systemPromptOverride: systemPromptOverride.trim() || null,
        },
      },
      {
        onSuccess: () => {
          notify({
            title: '已保存',
            description: '记忆实例配置已更新。',
            variant: 'success',
          })
          onOpenChange(false)
        },
        onError: (err) => {
          notify({
            title: '保存失败',
            description: err instanceof Error ? err.message : '请稍后重试。',
            variant: 'error',
          })
        },
      },
    )
  }

  const canSave = name.trim().length > 0 && !updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>编辑记忆实例</DialogTitle>
          <DialogDescription>
            修改记忆实例的域、核心记忆 URI 与系统提示词覆盖。
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {detailLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-9" />
              <Skeleton className="h-16" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="edit-mi-name"
                >
                  名称 <span className="text-error">*</span>
                </label>
                <Input
                  id="edit-mi-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="记忆实例名称"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="edit-mi-desc-input"
                >
                  描述
                </label>
                <Textarea
                  id="edit-mi-desc-input"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="可选描述"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="edit-mi-domains"
                >
                  有效域
                </label>
                <p className="text-xs text-muted">输入域名后按 Enter 添加</p>
                <TagInput
                  id="edit-mi-domains"
                  tags={validDomains}
                  onChange={setValidDomains}
                  placeholder="core, notes..."
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="edit-mi-uris"
                >
                  核心记忆 URI
                </label>
                <p className="text-xs text-muted">输入 URI 后按 Enter 添加</p>
                <TagInput
                  id="edit-mi-uris"
                  tags={coreMemoryUris}
                  onChange={setCoreMemoryUris}
                  placeholder="core://agent..."
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="edit-mi-spo"
                >
                  系统提示词覆盖
                </label>
                <Textarea
                  id="edit-mi-spo"
                  rows={3}
                  value={systemPromptOverride}
                  onChange={(e) => setSystemPromptOverride(e.target.value)}
                  placeholder="可选：覆盖 Agent 默认系统提示词"
                />
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={!canSave} onClick={handleSave}>
            {updateMutation.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
