import { useState, useEffect, type KeyboardEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useToast } from '@/shared/ui/toast'
import { useMemoryInstanceDetail } from '../api/memoryInstanceQueries'
import { useUpdateMemoryInstance } from '../api/memoryInstanceMutations'
import type { MemoryInstance } from '../types'

interface EditMemoryInstanceDialogProps {
  instance: MemoryInstance | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  id?: string
}

function TagInput({ tags, onChange, placeholder, id }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  function addTag(value: string) {
    const trimmed = value.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInputValue('')
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) addTag(inputValue)
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="edit-mi-desc"
          className="fixed left-1/2 top-1/2 z-50 flex w-[min(36rem,calc(100vw-2rem))] max-h-[min(44rem,calc(100vh-4rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-surface-elevated shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              编辑记忆实例
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
          <Dialog.Description className="sr-only" id="edit-mi-desc">
            编辑记忆实例配置
          </Dialog.Description>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 pb-2">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="edit-mi-name">
                    名称 <span className="text-red-400">*</span>
                  </label>
                  <Input
                    id="edit-mi-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="记忆实例名称"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="edit-mi-desc-input">
                    描述
                  </label>
                  <textarea
                    id="edit-mi-desc-input"
                    rows={2}
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="可选描述"
                  />
                </div>

                {/* Valid Domains */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="edit-mi-domains">
                    有效域
                  </label>
                  <p className="text-xs text-muted-foreground">
                    输入域名后按 Enter 添加
                  </p>
                  <TagInput
                    id="edit-mi-domains"
                    tags={validDomains}
                    onChange={setValidDomains}
                    placeholder="core, notes..."
                  />
                </div>

                {/* Core Memory URIs */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="edit-mi-uris">
                    核心记忆 URI
                  </label>
                  <p className="text-xs text-muted-foreground">
                    输入 URI 后按 Enter 添加
                  </p>
                  <TagInput
                    id="edit-mi-uris"
                    tags={coreMemoryUris}
                    onChange={setCoreMemoryUris}
                    placeholder="core://agent..."
                  />
                </div>

                {/* System Prompt Override */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="edit-mi-spo">
                    系统提示词覆盖
                  </label>
                  <textarea
                    id="edit-mi-spo"
                    rows={3}
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    value={systemPromptOverride}
                    onChange={(e) => setSystemPromptOverride(e.target.value)}
                    placeholder="可选：覆盖 Agent 默认系统提示词"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
            <Dialog.Close asChild>
              <Button variant="outline">取消</Button>
            </Dialog.Close>
            <Button disabled={!canSave} onClick={handleSave}>
              {updateMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              保存
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
