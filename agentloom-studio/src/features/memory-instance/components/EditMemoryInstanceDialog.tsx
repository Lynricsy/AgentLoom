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

  // detail 首次到达（或切换到另一个实例）时同步一次表单；后续 refetch 不覆盖用户正在编辑的值。
  // 渲染期比对 id 而非 useEffect，避免依赖数组需要压制 exhaustive-deps。
  const [syncedId, setSyncedId] = useState<string | null>(null)
  if (open && detail && detail.id !== syncedId) {
    setSyncedId(detail.id)
    setName(detail.name)
    setDescription(detail.description ?? '')
    setValidDomains(detail.validDomains)
    setCoreMemoryUris(detail.coreMemoryUris)
    setSystemPromptOverride(detail.systemPromptOverride ?? '')
  }

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSyncedId(null)
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
            // 骨架按真实字段结构排布（标签 + 控件），加载完成时弹窗高度不跳
            <div className="space-y-4" role="status" aria-label="正在加载…">
              {[
                'h-9',
                'h-16',
                'h-[2.625rem]',
                'h-[2.625rem]',
                'h-20',
              ].map((controlHeight, index) => (
                <div key={index} className="space-y-1.5">
                  <Skeleton className="h-5 w-24" />
                  {index === 2 || index === 3 ? <Skeleton className="h-4 w-40" /> : null}
                  <Skeleton className={controlHeight} />
                </div>
              ))}
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
                <p className="text-xs text-muted-foreground">输入域名后按 Enter 添加</p>
                <TagInput
                  id="edit-mi-domains"
                  tags={validDomains}
                  onChange={setValidDomains}
                  placeholder="core, notes…"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="edit-mi-uris"
                >
                  核心记忆 URI
                </label>
                <p className="text-xs text-muted-foreground">输入 URI 后按 Enter 添加</p>
                <TagInput
                  id="edit-mi-uris"
                  tags={coreMemoryUris}
                  onChange={setCoreMemoryUris}
                  placeholder="core://agent…"
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
            {updateMutation.isPending && <Loader2 className="animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
