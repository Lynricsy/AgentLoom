import { memo, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, X } from 'lucide-react'
import { useToast } from '@/shared/ui/toast'
import { useCreateWorkflow } from '@/features/workflow'
import type { TemplateDetail } from '../types'

const formSchema = z.object({
  name: z.string().min(1, '请输入工作流名称').max(255),
  description: z.string().max(2000).optional(),
})

type FormValues = z.infer<typeof formSchema>

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
  const { toast } = useToast()
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
        toast({
          title: '工作流已创建',
          description: `"${result.name}" 创建成功`,
        })
        navigate({
          to: '/workflows/$workflowId',
          params: { workflowId: result.id },
        })
      } catch {
        toast({
          title: '创建失败',
          description: '无法创建工作流，请稍后重试',
          variant: 'destructive',
        })
      }
    },
    [createWorkflow, template?.slug, onOpenChange, reset, toast, navigate],
  )

  const nodeCount = template?.metadata?.nodeCount ?? 0
  const edgeCount = template?.definition?.edges?.length ?? 0

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:fade-out-0">
          <Dialog.Close className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </Dialog.Close>

          <Dialog.Title className="text-base font-medium">
            从模板创建工作流
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            基于 "{template?.name}" 创建新工作流
          </Dialog.Description>

          {template && (
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{nodeCount} 个节点</span>
                <span>·</span>
                <span>{edgeCount} 条连线</span>
                {template.metadata?.complexity && (
                  <>
                    <span>·</span>
                    <span>
                      {template.metadata.complexity === 'beginner'
                        ? '入门'
                        : template.metadata.complexity === 'intermediate'
                          ? '中级'
                          : '高级'}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="wf-name"
                className="mb-1.5 block text-sm font-medium"
              >
                工作流名称
              </label>
              <input
                id="wf-name"
                {...register('name')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="输入工作流名称"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="wf-desc"
                className="mb-1.5 block text-sm font-medium"
              >
                描述{' '}
                <span className="font-normal text-muted-foreground">
                  (可选)
                </span>
              </label>
              <textarea
                id="wf-desc"
                {...register('description')}
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="描述这个工作流的用途"
              />
              {errors.description && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                创建工作流
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
