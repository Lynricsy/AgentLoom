import { memo, useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" data-testid="block-create-dialog">
        <DialogHeader>
          <DialogTitle>创建可复用块</DialogTitle>
          <DialogDescription>
            将当前选中的节点封装为单个可复用块，并允许你在创建前调整端口名称。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-5">
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
              <Textarea
                id="block-description"
                aria-label="描述"
                className="resize-none"
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
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button type="submit">确认创建</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <section className="space-y-3 rounded-lg border border-border bg-muted p-4">
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
            <div key={port.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">{port.dataType}</span>
                <span className="text-2xs text-muted-foreground">
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
