import { memo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from '@tanstack/react-router'
import { GitBranch, Bot, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface CreateOrchestrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface TypeCardProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}

function TypeCard({ icon, title, description, onClick }: TypeCardProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-border/60 bg-card p-5 text-left',
        'transition-colors hover:border-primary/60 hover:bg-muted/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
      onClick={onClick}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </button>
  )
}

export const CreateOrchestrationDialog = memo(function CreateOrchestrationDialog({
  open,
  onOpenChange,
}: CreateOrchestrationDialogProps) {
  const navigate = useNavigate()

  function handleSelectWorkflow() {
    onOpenChange(false)
    navigate({ to: '/workflows/$workflowId', params: { workflowId: 'draft' } })
  }

  function handleSelectAgent() {
    onOpenChange(false)
    navigate({ to: '/agents' })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
                新建编排
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                请选择要创建的编排类型
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
              <X className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">关闭</span>
            </Dialog.Close>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <TypeCard
              icon={<GitBranch className="h-5 w-5" />}
              title="工作流"
              description="通过可视化 DAG 将多个节点串联成自动化流程"
              onClick={handleSelectWorkflow}
            />
            <TypeCard
              icon={<Bot className="h-5 w-5" />}
              title="智能体"
              description="配置具备记忆和工具调用能力的对话式 Agent"
              onClick={handleSelectAgent}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
