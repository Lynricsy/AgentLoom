import { memo, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { WorkflowPreviewCanvas } from '@/features/canvas'
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
      } catch {
        notify({
          title: '创建失败',
          description: '无法创建工作流，请稍后重试',
          variant: 'error',
        })
      }
    },
    [createWorkflow, template?.slug, onOpenChange, reset, notify, navigate],
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
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
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
                  className="h-[200px] overflow-hidden rounded-card border border-border"
                  data-testid="template-preview"
                >
                  <WorkflowPreviewCanvas definition={template.definition} />
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
                描述 <span className="font-normal text-muted">(可选)</span>
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
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              创建工作流
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
})
