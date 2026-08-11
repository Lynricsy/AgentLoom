import { memo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bot, Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
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
import { useCreateAgent } from '../api/agentMutations'
import type { AgentRuntimeMode } from '../types'

interface CreateOrchestrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const RUNTIME_MODE_OPTIONS: Array<{
  value: AgentRuntimeMode
  title: string
  description: string
}> = [
  {
    value: 'sandbox',
    title: '有沙箱',
    description: '支持工作区、终端和内置文件工具，可调用有沙箱或无沙箱子 Agent。',
  },
  {
    value: 'no_sandbox',
    title: '无沙箱',
    description: '不提供内置文件/终端工具，仅支持 HTTP MCP，适合纯推理与资源编排。',
  },
]

export const CreateOrchestrationDialog = memo(function CreateOrchestrationDialog({
  open,
  onOpenChange,
}: CreateOrchestrationDialogProps) {
  const navigate = useNavigate()
  const createAgent = useCreateAgent()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [runtimeMode, setRuntimeMode] = useState<AgentRuntimeMode>('sandbox')

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName('')
      setDescription('')
      setIcon(null)
      setRuntimeMode('sandbox')
    }
    onOpenChange(nextOpen)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const agentName = name.trim() || '未命名智能体'
    if (createAgent.isPending) return

    try {
      const agent = await createAgent.mutateAsync({
        name: agentName,
        description: description.trim() || undefined,
        icon: icon ?? undefined,
        runtimeMode,
      })
      handleOpenChange(false)
      navigate({ to: '/agents/$agentId', params: { agentId: agent.id } })
    } catch {
      // 创建失败时保持对话框打开，mutation 错误由 TanStack Query 管理
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>新建 Agent</DialogTitle>
          <DialogDescription>创建一个新的智能体</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-name">
                <Label>名称</Label>
              </label>
              <div className="flex items-center gap-2">
                <EmojiIconPicker value={icon} onChange={setIcon} fallbackIcon={Bot} />
                <Input
                  id="agent-name"
                  placeholder="未命名智能体"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="flex-1"
                />
              </div>
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-medium text-foreground">
                运行形态
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {RUNTIME_MODE_OPTIONS.map((option) => {
                  const active = runtimeMode === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRuntimeMode(option.value)}
                      className={cn(
                        'rounded-card border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                        active
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-border-hover hover:bg-surface-elevated',
                      )}
                    >
                      <div className="text-sm font-medium text-foreground">
                        {option.title}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        {option.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-desc">
                <Label>描述</Label>
              </label>
              <Textarea
                id="agent-desc"
                placeholder="可选，简要描述智能体的功能"
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
            <Button type="submit" disabled={createAgent.isPending}>
              {createAgent.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})
