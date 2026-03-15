import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, MessageSquare, Play, X } from 'lucide-react'
import type {
  ConversationPlan,
  WorkflowInputFieldDefinition,
  WorkflowInputSchema,
  WorkflowStatus,
} from '@/features/workflow/types'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useToast } from '@/shared/ui/toast'
import {
  DEFAULT_CONVERSATION_PLAN,
  buildLaunchInitialValues,
  isWorkflowInputFieldVisible,
  normalizeLaunchFieldValue,
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

type LaunchStage = 'form' | 'conversation' | 'summary'

interface ConversationMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
}

const CONVERSATION_MESSAGE_CLASSNAME = {
  assistant: 'self-start border-border/70 bg-background/70 text-foreground',
  user: 'self-end border-primary/30 bg-primary/10 text-foreground',
} satisfies Record<ConversationMessage['role'], string>

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
  const [stage, setStage] = useState<LaunchStage>('form')
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([])
  const [conversationInput, setConversationInput] = useState('')
  const [conversationError, setConversationError] = useState<string | null>(null)
  const [conversationCompletedFieldIds, setConversationCompletedFieldIds] = useState<string[]>([])
  const [currentConversationFieldId, setCurrentConversationFieldId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const initialValues = buildLaunchInitialValues(schema)
    setValues(initialValues)
    setErrors({})
    setConversationMessages([])
    setConversationInput('')
    setConversationError(null)
    setConversationCompletedFieldIds([])

    if (schema.collectionMode === 'conversation') {
      const nextField = findNextConversationField(schema, initialValues, [])
      setCurrentConversationFieldId(nextField?.id ?? null)
      setConversationMessages(buildConversationIntroMessages(nextField))
      setStage(nextField ? 'conversation' : 'summary')
      return
    }

    setCurrentConversationFieldId(null)
    setStage('form')
  }, [open, schema])

  const visibleFields = useMemo(
    () => schema.fields.filter((field) => isWorkflowInputFieldVisible(field, values)),
    [schema.fields, values],
  )

  const currentConversationField = useMemo(
    () =>
      currentConversationFieldId
        ? schema.fields.find((field) => field.id === currentConversationFieldId) ?? null
        : null,
    [currentConversationFieldId, schema.fields],
  )

  const handleFinalSubmit = async () => {
    const nextErrors = validateLaunchValues(visibleFields, values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
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

  const startConversationStage = () => {
    const nextField = findNextConversationField(schema, values, [])
    setConversationCompletedFieldIds([])
    setConversationMessages(buildConversationIntroMessages(nextField))
    setConversationInput('')
    setConversationError(null)
    setCurrentConversationFieldId(nextField?.id ?? null)
    setStage(nextField ? 'conversation' : 'summary')
  }

  const handleConversationSend = () => {
    if (!currentConversationField) {
      setStage('summary')
      return
    }

    const normalizedValue = normalizeLaunchFieldValue(currentConversationField, conversationInput)
    const nextFieldValue =
      normalizedValue ??
      (currentConversationField.type === 'multi_select'
        ? []
        : currentConversationField.type === 'number'
          ? ''
          : '')

    const nextFieldErrors = validateLaunchValues([currentConversationField], {
      [currentConversationField.id]: nextFieldValue,
    })

    if (nextFieldErrors[currentConversationField.id]) {
      setConversationError(nextFieldErrors[currentConversationField.id] ?? null)
      return
    }

    const nextValues = {
      ...values,
      [currentConversationField.id]: nextFieldValue,
    }
    const nextCompletedFieldIds = [...conversationCompletedFieldIds, currentConversationField.id]
    const nextField = findNextConversationField(schema, nextValues, nextCompletedFieldIds)

    setValues(nextValues)
    setErrors((current) => {
      if (!current[currentConversationField.id]) {
        return current
      }

      return {
        ...current,
        [currentConversationField.id]: '',
      }
    })
    setConversationCompletedFieldIds(nextCompletedFieldIds)
    setConversationMessages((current) => [
      ...current,
      {
        id: `${currentConversationField.id}-reply-${current.length}`,
        role: 'user',
        content: conversationInput.trim() || '（留空）',
      },
      {
        id: `${nextField?.id ?? 'summary'}-assistant-${current.length}`,
        role: 'assistant',
        content: nextField
          ? buildConversationFieldPrompt(nextField)
          : '已完成当前可见字段的采集，请确认最终运行参数。',
      },
    ])
    setConversationInput('')
    setConversationError(null)
    setCurrentConversationFieldId(nextField?.id ?? null)
    setStage(nextField ? 'conversation' : 'summary')
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
              {schema.collectionMode === 'form' ? (
                <FormStage
                  schema={schema}
                  values={values}
                  errors={errors}
                  onChange={(fieldId, nextValue) => {
                    setValues((current) => ({
                      ...current,
                      [fieldId]: nextValue,
                    }))
                    setErrors((current) => clearFieldError(current, fieldId))
                  }}
                />
              ) : null}

              {schema.collectionMode === 'conversation' && stage === 'conversation' ? (
                <ConversationStage
                  conversationPlan={schema.conversationPlan}
                  messages={conversationMessages}
                  currentField={currentConversationField}
                  inputValue={conversationInput}
                  errorMessage={conversationError}
                  onInputChange={setConversationInput}
                />
              ) : null}

              {schema.collectionMode === 'hybrid' && stage === 'form' ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground">步骤 1：表单补充</h3>
                    <p className="text-xs text-muted-foreground">
                      先填写已知的结构化字段，剩余内容再通过对话壳逐项补齐。
                    </p>
                  </div>

                  <FormStage
                    schema={schema}
                    values={values}
                    errors={errors}
                    onChange={(fieldId, nextValue) => {
                      setValues((current) => ({
                        ...current,
                        [fieldId]: nextValue,
                      }))
                      setErrors((current) => clearFieldError(current, fieldId))
                    }}
                  />
                </div>
              ) : null}

              {schema.collectionMode === 'hybrid' && stage === 'conversation' ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground">步骤 2：对话补充</h3>
                    <p className="text-xs text-muted-foreground">
                      仅追问表单阶段尚未解决的可见字段，最终会合并成统一的运行参数。
                    </p>
                  </div>

                  <ConversationStage
                    conversationPlan={schema.conversationPlan}
                    messages={conversationMessages}
                    currentField={currentConversationField}
                    inputValue={conversationInput}
                    errorMessage={conversationError}
                    onInputChange={setConversationInput}
                  />
                </div>
              ) : null}

              {stage === 'summary' ? (
                <SummaryStage
                  schema={schema}
                  values={values}
                  errors={errors}
                  onChange={(fieldId, nextValue) => {
                    setValues((current) => ({
                      ...current,
                      [fieldId]: nextValue,
                    }))
                    setErrors((current) => clearFieldError(current, fieldId))
                  }}
                />
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  取消
                </Button>

                {schema.collectionMode === 'hybrid' && stage === 'conversation' ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStage('form')
                      setConversationInput('')
                      setConversationError(null)
                    }}
                    data-testid="launch-dialog-back-stage"
                  >
                    返回表单
                  </Button>
                ) : null}

                {schema.collectionMode === 'hybrid' && stage === 'form' ? (
                  <Button onClick={startConversationStage} data-testid="launch-dialog-next-stage">
                    继续对话补充
                  </Button>
                ) : null}

                {(schema.collectionMode === 'conversation' ||
                  (schema.collectionMode === 'hybrid' && stage === 'conversation')) ? (
                  <Button
                    onClick={handleConversationSend}
                    data-testid="launch-conversation-send"
                    disabled={isStarting || !currentConversationField}
                  >
                    <MessageSquare className="mr-1.5 h-4 w-4" />
                    提交本轮回复
                  </Button>
                ) : null}

                {(schema.collectionMode === 'form' || stage === 'summary') ? (
                  <Button
                    onClick={() => void handleFinalSubmit()}
                    disabled={isStarting}
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
                        运行
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function FormStage({
  schema,
  values,
  errors,
  onChange,
}: {
  schema: WorkflowInputSchema
  values: Record<string, unknown>
  errors: Record<string, string>
  onChange: (fieldId: string, value: unknown) => void
}) {
  const visibleFields = schema.fields.filter((field) => isWorkflowInputFieldVisible(field, values))

  if (visibleFields.length === 0) {
    return (
      <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
        当前工作流没有需要填写的字段，确认后将直接启动执行。
      </div>
    )
  }

  return (
    <InputSchemaRenderer
      schema={schema}
      values={values}
      errors={errors}
      idPrefix="execution-launch"
      dataTestId="execution-launch-fields"
      onChange={onChange}
    />
  )
}

function ConversationStage({
  conversationPlan,
  messages,
  currentField,
  inputValue,
  errorMessage,
  onInputChange,
}: {
  conversationPlan?: ConversationPlan
  messages: ConversationMessage[]
  currentField: WorkflowInputFieldDefinition | null
  inputValue: string
  errorMessage: string | null
  onInputChange: (value: string) => void
}) {
  return (
    <section
      className="space-y-4 rounded-xl border border-border/70 bg-background/70 p-4"
      data-testid="launch-conversation-shell"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">对话收集</h3>
        <p className="text-xs text-muted-foreground">
          系统提示词会先给出收集策略，再结合字段顺序逐项提问。最多 {conversationPlan?.maxTurns ?? DEFAULT_CONVERSATION_PLAN.maxTurns} 轮。
        </p>
      </div>

      <div className="rounded-xl border border-border/70 bg-surface/80 px-4 py-3 text-sm text-foreground">
        {conversationPlan?.systemPrompt || '请逐项补全工作流运行所需的输入参数。'}
      </div>

      <div className="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-xl border border-border/70 bg-surface/60 p-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'max-w-[90%] rounded-xl border px-3 py-2 text-sm whitespace-pre-wrap',
              CONVERSATION_MESSAGE_CLASSNAME[message.role],
            )}
          >
            {message.content}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          当前字段：{currentField?.label ?? '已完成'}
        </div>

        {currentField ? (
          <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground">
            {currentField.label}
          </div>
        ) : null}

        <Input
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          aria-label="回复内容"
          placeholder={currentField ? `请输入 ${currentField.label}` : '当前没有待回复字段'}
          disabled={!currentField}
        />

        {errorMessage ? <p className="text-xs text-error">{errorMessage}</p> : null}
      </div>
    </section>
  )
}

function SummaryStage({
  schema,
  values,
  errors,
  onChange,
}: {
  schema: WorkflowInputSchema
  values: Record<string, unknown>
  errors: Record<string, string>
  onChange: (fieldId: string, value: unknown) => void
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-background/70 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">确认运行参数</h3>
        <p className="text-xs text-muted-foreground">
          这里展示最终将提交给执行端的结构化参数，运行前仍可手动修正。
        </p>
      </div>

      <FormStage schema={schema} values={values} errors={errors} onChange={onChange} />
    </section>
  )
}

function findNextConversationField(
  schema: WorkflowInputSchema,
  values: Record<string, unknown>,
  completedFieldIds: string[],
): WorkflowInputFieldDefinition | null {
  const completedSet = new Set(completedFieldIds)

  return (
    schema.fields.find((field) => {
      if (completedSet.has(field.id)) {
        return false
      }

      if (!isWorkflowInputFieldVisible(field, values)) {
        return false
      }

      return normalizeLaunchFieldValue(field, values[field.id]) === undefined
    }) ?? null
  )
}

function buildConversationIntroMessages(
  nextField: WorkflowInputFieldDefinition | null,
): ConversationMessage[] {
  const messages: ConversationMessage[] = []

  if (nextField) {
    messages.push({
      id: `conversation-prompt-${nextField.id}`,
      role: 'assistant',
      content: buildConversationFieldPrompt(nextField),
    })
  }

  return messages
}

function buildConversationFieldPrompt(field: WorkflowInputFieldDefinition): string {
  const hint = field.collectionHint?.trim() || field.description?.trim()

  return [
    `请提供「${field.label}」${field.required ? '（必填）' : '（可选）'}。`,
    hint ? `提示：${hint}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function clearFieldError(
  currentErrors: Record<string, string>,
  fieldId: string,
): Record<string, string> {
  if (!currentErrors[fieldId]) {
    return currentErrors
  }

  return {
    ...currentErrors,
    [fieldId]: '',
  }
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
