import { memo, useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { resolveProblemDetail } from '@/shared/api/problemDetail'
import { WorkflowPreviewCanvas } from '@/features/canvas'
import { ChatModelSelect, useUsableChatModels } from '@/features/llm'
import { Badge } from '@/shared/ui/badge'
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
import { useToast } from '@/shared/ui/toast'
import { useCreateWorkflow } from '@/features/workflow'
import type { TemplateDetail } from '../types'

const formSchema = z.object({
  name: z.string().min(1, '请输入工作流名称').max(255),
  description: z.string().max(2000).optional(),
})

type FormValues = z.infer<typeof formSchema>

const COMPLEXITY_LABELS: Record<string, string> = {
  beginner: '入门',
  intermediate: '中级',
  advanced: '高级',
}

interface TemplateWizardDialogProps {
  template: TemplateDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const TemplateWizardDialog = memo(function TemplateWizardDialog({
  template,
  open,
  onOpenChange,
}: TemplateWizardDialogProps) {
  const navigate = useNavigate()
  const { notify } = useToast()
  const createWorkflow = useCreateWorkflow()
  const usableChatModels = useUsableChatModels()
  const chatModels = usableChatModels.data ?? []
  // 只有确认账号里一个可用对话模型都没有时才拦截；加载中/加载失败交给服务端判定
  const hasNoUsableChatModel = usableChatModels.isSuccess && chatModels.length === 0
  const [modelConfigId, setModelConfigId] = useState<string | undefined>()

  useEffect(() => {
    if (!open) setModelConfigId(undefined)
  }, [open])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      name: template ? `${template.name}的副本` : '',
      description: template?.description ?? '',
    },
  })

  const onSubmit = useCallback(
    async (values: FormValues) => {
      try {
        const result = await createWorkflow.mutateAsync({
          name: values.name,
          description: values.description || undefined,
          templateSlug: template?.slug,
          modelConfigId,
        })
        onOpenChange(false)
        reset()
        notify({
          title: '工作流已创建',
          description: `"${result.name}" 创建成功`,
        })
        navigate({
          to: '/workflows/$workflowId',
          params: { workflowId: result.id },
        })
      } catch (error) {
        notify({
          title: '创建失败',
          description: resolveProblemDetail(error, '无法创建工作流，请稍后重试'),
          variant: 'error',
        })
      }
    },
    [createWorkflow, template?.slug, modelConfigId, onOpenChange, reset, notify, navigate],
  )

  const nodeCount = template?.metadata?.nodeCount ?? 0
  const edgeCount = template?.definition?.edges?.length ?? 0
  const complexity = template?.metadata?.complexity

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="sm:max-h-[88vh]"
        data-testid="template-wizard-dialog"
      >
        <DialogHeader>
          <DialogTitle>从模板创建工作流</DialogTitle>
          <DialogDescription>基于 "{template?.name}" 创建新工作流</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="space-y-4">
            {template && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{nodeCount} 个节点</span>
                  <span aria-hidden>·</span>
                  <span>{edgeCount} 条连线</span>
                  {complexity && (
                    <Badge variant="secondary">
                      {COMPLEXITY_LABELS[complexity] ?? complexity}
                    </Badge>
                  )}
                </div>
                <div
                  className="h-[200px] overflow-hidden rounded-lg border border-border"
                  data-testid="template-preview"
                >
                  <WorkflowPreviewCanvas
                    definition={template.definition}
                    lodOverride="full"
                    emptyFallback={
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        该模板暂无画布内容
                      </div>
                    }
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="wf-name"
                className="block text-sm font-medium text-foreground"
              >
                工作流名称
              </label>
              <Input
                id="wf-name"
                {...register('name')}
                placeholder="输入工作流名称"
              />
              {errors.name && (
                <p className="text-xs font-medium text-error">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="wf-desc"
                className="block text-sm font-medium text-foreground"
              >
                描述 <span className="font-normal text-muted-foreground">(可选)</span>
              </label>
              <Textarea
                id="wf-desc"
                {...register('description')}
                rows={3}
                className="resize-none"
                placeholder="描述这个工作流的用途"
              />
              {errors.description && (
                <p className="text-xs font-medium text-error">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="wf-agent-model"
                className="block text-sm font-medium text-foreground"
              >
                Agent 使用的模型
              </label>
              <ChatModelSelect
                id="wf-agent-model"
                data-testid="template-agent-model-select"
                value={modelConfigId}
                onValueChange={setModelConfigId}
                models={chatModels}
                disabled={isSubmitting || hasNoUsableChatModel}
              />
              <p className="text-xs text-muted-foreground">
                模板里的每个 Agent 会在你的账号中自动创建并使用这个模型。
              </p>
              {hasNoUsableChatModel && (
                <div
                  className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
                  data-testid="template-no-chat-model-warning"
                >
                  你的账号中还没有可用的对话模型，模板里的 Agent 无法创建。请先到{' '}
                  <Link
                    to="/resources/llm-models"
                    className="font-medium underline underline-offset-2"
                    onClick={() => onOpenChange(false)}
                  >
                    模型管理
                  </Link>{' '}
                  添加并启用一个对话模型。
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || hasNoUsableChatModel}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              创建工作流
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})
