import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Play, X } from 'lucide-react'
import type { WorkflowInputFieldDefinition, WorkflowInputSchema, WorkflowStatus } from '@/features/workflow/types'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import {
  buildLaunchInitialValues,
  isWorkflowInputFieldVisible,
  sanitizeLaunchInputParams,
} from '../lib/schemaHelpers'
import { useResolvedWorkflowInputSchema } from '../hooks/useResolvedWorkflowInputSchema'
import { InputSchemaRenderer } from './InputSchemaRenderer'

interface ExecutionLaunchDialogProps {
  open: boolean
  workflowId: string
  workflowName: string
  workflowStatus: WorkflowStatus
  draftInputSchema: WorkflowInputSchema | null
  isStarting?: boolean
  onStartExecution: (
    workflowId: string,
    options: {
      inputParams: Record<string, unknown>
      schemaVersion: number
      launchSource: 'web-studio'
    },
  ) => Promise<unknown>
  onOpenChange: (open: boolean) => void
}

export function ExecutionLaunchDialog({
  open,
  workflowId,
  workflowName,
  workflowStatus,
  draftInputSchema,
  isStarting = false,
  onStartExecution,
  onOpenChange,
}: ExecutionLaunchDialogProps) {
  const { notify } = useToast()
  const { schema, isLoading, error, refetch } = useResolvedWorkflowInputSchema({
    workflowId,
    workflowStatus,
    draftInputSchema,
    enabled: open,
  })
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) {
      return
    }

    setValues(buildLaunchInitialValues(schema))
    setErrors({})
  }, [open, schema])

  const visibleFields = useMemo(
    () => schema.fields.filter((field) => isWorkflowInputFieldVisible(field, values)),
    [schema.fields, values],
  )

  const unsupportedCollectionMode = schema.collectionMode !== 'form'

  const handleSubmit = async () => {
    const nextErrors = validateLaunchValues(visibleFields, values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0 || unsupportedCollectionMode) {
      if (unsupportedCollectionMode) {
        notify({
          title: '暂不支持当前模式',
          description: '当前 Web Studio 仅支持表单模式启动。',
          variant: 'warning',
        })
      }
      return
    }

    try {
      await onStartExecution(workflowId, {
        inputParams: sanitizeLaunchInputParams(schema, values),
        schemaVersion: schema.version,
        launchSource: 'web-studio',
      })
      onOpenChange(false)
    } catch (submitError) {
      notify({
        title: '启动失败',
        description:
          submitError instanceof Error ? submitError.message : '启动执行时发生错误。',
        variant: 'error',
      })
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Dialog.Title className="text-lg font-semibold text-foreground">
                启动工作流
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                为「{workflowName}」填写运行参数后启动执行。
              </Dialog.Description>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="关闭"
                className="rounded-md border border-border bg-background p-2 text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {isLoading ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载输入 Schema...
            </div>
          ) : null}

          {!isLoading && error ? (
            <div className="mt-6 space-y-3 rounded-xl border border-error/60 bg-error/10 p-4 text-sm text-error">
              <p>读取输入 Schema 失败：{error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                重试
              </Button>
            </div>
          ) : null}

          {!isLoading && !error ? (
            <div className="mt-6 space-y-4">
              {unsupportedCollectionMode ? (
                <div className="rounded-xl border border-warning/60 bg-warning/10 px-4 py-3 text-sm text-warning">
                  当前 Web Studio 仅支持表单模式启动。
                </div>
              ) : null}

              {visibleFields.length === 0 ? (
                <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                  当前工作流没有需要填写的字段，确认后将直接启动执行。
                </div>
              ) : (
                <InputSchemaRenderer
                  schema={schema}
                  values={values}
                  errors={errors}
                  idPrefix="execution-launch"
                  dataTestId="execution-launch-fields"
                  onChange={(fieldId, nextValue) => {
                    setValues((current) => ({
                      ...current,
                      [fieldId]: nextValue,
                    }))
                    setErrors((current) => {
                      if (!current[fieldId]) {
                        return current
                      }

                      return {
                        ...current,
                        [fieldId]: '',
                      }
                    })
                  }}
                />
              )}

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button
                  onClick={() => void handleSubmit()}
                  disabled={unsupportedCollectionMode || isStarting}
                  data-testid="confirm-launch-workflow"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      启动中
                    </>
                  ) : (
                    <>
                      <Play className="mr-1.5 h-4 w-4" />
                      启动执行
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function validateLaunchValues(
  fields: WorkflowInputFieldDefinition[],
  values: Record<string, unknown>,
): Record<string, string> {
  return fields.reduce<Record<string, string>>((accumulator, field) => {
    const value = values[field.id]

    if (field.required) {
      if (field.type === 'multi_select') {
        if (!Array.isArray(value) || value.length === 0) {
          accumulator[field.id] = `${field.label}不能为空`
          return accumulator
        }
      } else if (field.type === 'number') {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          accumulator[field.id] = `${field.label}不能为空`
          return accumulator
        }
      } else if (typeof value !== 'string' || value.trim() === '') {
        accumulator[field.id] = `${field.label}不能为空`
        return accumulator
      }
    }

    if (field.type === 'text' && typeof value === 'string') {
      if (field.validation?.minLength !== undefined && value.length < field.validation.minLength) {
        accumulator[field.id] = `${field.label}至少需要 ${field.validation.minLength} 个字符`
        return accumulator
      }
      if (field.validation?.maxLength !== undefined && value.length > field.validation.maxLength) {
        accumulator[field.id] = `${field.label}不能超过 ${field.validation.maxLength} 个字符`
        return accumulator
      }
    }

    if (field.type === 'number' && typeof value === 'number' && !Number.isNaN(value)) {
      if (field.validation?.min !== undefined && value < field.validation.min) {
        accumulator[field.id] = `${field.label}不能小于 ${field.validation.min}`
        return accumulator
      }
      if (field.validation?.max !== undefined && value > field.validation.max) {
        accumulator[field.id] = `${field.label}不能大于 ${field.validation.max}`
        return accumulator
      }
    }

    return accumulator
  }, {})
}
