import { memo, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import type { DerivedPort, EncapsulationAnalysis } from '../lib/encapsulation'

const BLOCK_CATEGORY_OPTIONS = [
  { value: 'analysis', label: '分析' },
  { value: 'content', label: '内容' },
  { value: 'development', label: '开发' },
  { value: 'automation', label: '自动化' },
  { value: 'reporting', label: '报告' },
] as const

const derivedPortSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, '请输入端口名称'),
  dataType: z.enum(['model', 'text', 'json', 'array', 'image', 'audio', 'tool', 'sandbox', 'knowledge', 'skill', 'agent', 'memory', 'exec', 'volume']),
  sourceNodeId: z.string().min(1),
  sourcePortId: z.string().min(1),
})

const formSchema = z.object({
  name: z.string().trim().min(1, '请输入块名称').max(255),
  description: z.string().max(2000).optional(),
  category: z.enum(['analysis', 'content', 'development', 'automation', 'reporting']),
  tags: z.string().optional(),
  inputPorts: z.array(derivedPortSchema),
  outputPorts: z.array(derivedPortSchema),
})

type FormValues = z.infer<typeof formSchema>

export interface BlockCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysis: EncapsulationAnalysis
  onConfirm: (data: {
    name: string
    description: string
    category: 'analysis' | 'content' | 'development' | 'automation' | 'reporting'
    tags: string[]
    inputPorts: DerivedPort[]
    outputPorts: DerivedPort[]
  }) => void
}

function normalizeTags(raw: string | undefined): string[] {
  if (!raw) {
    return []
  }

  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

export const BlockCreateDialog = memo(function BlockCreateDialog({
  open,
  onOpenChange,
  analysis,
  onConfirm,
}: BlockCreateDialogProps) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      category: 'analysis',
      tags: '',
      inputPorts: analysis.inputPorts,
      outputPorts: analysis.outputPorts,
    },
  })

  useEffect(() => {
    reset({
      name: '',
      description: '',
      category: 'analysis',
      tags: '',
      inputPorts: analysis.inputPorts,
      outputPorts: analysis.outputPorts,
    })
  }, [analysis, reset])

  const onSubmit = handleSubmit((values) => {
    onConfirm({
      name: values.name.trim(),
      description: values.description?.trim() ?? '',
      category: values.category,
      tags: normalizeTags(values.tags),
      inputPorts: values.inputPorts,
      outputPorts: values.outputPorts,
    })
    onOpenChange(false)
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl"
          data-testid="block-create-dialog"
        >
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 top-3 h-8 w-8 p-0"
              aria-label="关闭创建块对话框"
            >
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>

          <Dialog.Title className="text-base font-semibold text-foreground">
            创建可复用块
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            将当前选中的节点封装为单个可复用块，并允许你在创建前调整端口名称。
          </Dialog.Description>

          <form onSubmit={onSubmit} className="mt-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label htmlFor="block-name" className="space-y-2">
                <Label>块名称</Label>
                <Input id="block-name" aria-label="块名称" placeholder="输入块名称" {...register('name')} />
                {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
              </label>

              <div className="space-y-2">
                <Label>分类</Label>
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="block-category" aria-label="分类">
                        <SelectValue placeholder="请选择分类" />
                      </SelectTrigger>
                      <SelectContent>
                        {BLOCK_CATEGORY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.category && <p className="text-xs text-error">{errors.category.message}</p>}
              </div>
            </div>

            <label htmlFor="block-description" className="block space-y-2">
              <Label>描述</Label>
              <textarea
                id="block-description"
                aria-label="描述"
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                placeholder="描述这个可复用块的用途"
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs text-error">{errors.description.message}</p>
              )}
            </label>

            <label htmlFor="block-tags" className="block space-y-2">
              <Label>标签</Label>
              <Input
                id="block-tags"
                aria-label="标签"
                placeholder="使用逗号分隔，例如：report, summary"
                {...register('tags')}
              />
            </label>

            <div className="grid gap-4 lg:grid-cols-2">
              <PortEditorSection
                title="输入端口"
                ports={analysis.inputPorts}
                register={register}
                fieldPath="inputPorts"
              />
              <PortEditorSection
                title="输出端口"
                ports={analysis.outputPorts}
                register={register}
                fieldPath="outputPorts"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button variant="outline">取消</Button>
              </Dialog.Close>
              <Button type="submit">确认创建</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})

interface PortEditorSectionProps {
  title: string
  ports: DerivedPort[]
  register: ReturnType<typeof useForm<FormValues>>['register']
  fieldPath: 'inputPorts' | 'outputPorts'
}

function PortEditorSection({ title, ports, register, fieldPath }: PortEditorSectionProps) {
  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{ports.length} 个</span>
      </div>

      {ports.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          当前没有需要暴露的端口。
        </p>
      ) : (
        <div className="space-y-3">
          {ports.map((port, index) => (
            <div key={port.id} className="rounded-lg border border-border/60 bg-background/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">{port.dataType}</span>
                <span className="text-[11px] text-muted-foreground">
                  {port.sourceNodeId} · {port.sourcePortId}
                </span>
              </div>

              <div className="mt-2 space-y-2">
                <Label>端口名称</Label>
                <Input
                  data-testid={`block-${fieldPath === 'inputPorts' ? 'input' : 'output'}-port-label-${port.id}`}
                  {...register(`${fieldPath}.${index}.label`)}
                />
              </div>

              <input type="hidden" {...register(`${fieldPath}.${index}.id`)} />
              <input type="hidden" {...register(`${fieldPath}.${index}.dataType`)} />
              <input type="hidden" {...register(`${fieldPath}.${index}.sourceNodeId`)} />
              <input type="hidden" {...register(`${fieldPath}.${index}.sourcePortId`)} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
