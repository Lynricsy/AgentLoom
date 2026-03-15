import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useUpdateWorkflow } from '@/features/workflow/api/workflowMutations'
import type {
  WorkflowInputCollectionMode,
  WorkflowInputFieldDefinition,
  WorkflowInputFieldType,
  WorkflowInputSchema,
} from '@/features/workflow/types'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select } from '@/shared/ui/select'
import { useToast } from '@/shared/ui/toast'
import {
  DEFAULT_CONVERSATION_PLAN,
  buildLaunchInitialValues,
  createEmptyWorkflowInputField,
  formatDefaultValue,
  formatOptionsInput,
  normalizeDefaultValue,
  normalizeVisibilityEquals,
  normalizeWorkflowInputSchema,
  parseOptionsInput,
} from '../lib/schemaHelpers'
import { InputSchemaRenderer } from './InputSchemaRenderer'

interface WorkflowInputSchemaTabProps {
  workflowId: string
  workflowVersion: number
  inputSchema: WorkflowInputSchema | null
  isReadOnly: boolean
}

const FIELD_TYPE_OPTIONS: Array<{ value: WorkflowInputFieldType; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'single_select', label: '单选' },
  { value: 'multi_select', label: '多选' },
]

const COLLECTION_MODE_OPTIONS: Array<{
  value: WorkflowInputCollectionMode
  label: string
  description: string
}> = [
  {
    value: 'form',
    label: '表单模式',
    description: '直接渲染结构化表单，适合一次性填写。',
  },
  {
    value: 'conversation',
    label: '对话模式',
    description: '通过客户端对话壳逐项收集字段值。',
  },
  {
    value: 'hybrid',
    label: '混合模式',
    description: '先表单补充，再通过对话追问剩余字段。',
  },
]

const TEXTAREA_CLASSNAME =
  'min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50'

export function WorkflowInputSchemaTab({
  workflowId,
  workflowVersion,
  inputSchema,
  isReadOnly,
}: WorkflowInputSchemaTabProps) {
  const { notify } = useToast()
  const updateWorkflow = useUpdateWorkflow(workflowId)
  const [schema, setSchema] = useState(() => normalizeWorkflowInputSchema(inputSchema))
  const [currentWorkflowVersion, setCurrentWorkflowVersion] = useState(workflowVersion)
  const [errorMessages, setErrorMessages] = useState<string[]>([])
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>(() =>
    buildLaunchInitialValues(normalizeWorkflowInputSchema(inputSchema)),
  )

  useEffect(() => {
    setSchema(normalizeWorkflowInputSchema(inputSchema))
  }, [inputSchema])

  useEffect(() => {
    setCurrentWorkflowVersion(workflowVersion)
  }, [workflowVersion])

  useEffect(() => {
    setPreviewValues(buildLaunchInitialValues(schema))
  }, [schema])

  const fieldOptions = useMemo(
    () => schema.fields.map((field) => ({ value: field.id, label: field.label || field.id })),
    [schema.fields],
  )

  const showsConversationPlan =
    schema.collectionMode === 'conversation' || schema.collectionMode === 'hybrid'

  const updateField = (
    index: number,
    updater: (field: WorkflowInputFieldDefinition) => WorkflowInputFieldDefinition,
  ) => {
    setSchema((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? updater(field) : field,
      ),
    }))
  }

  const moveField = (fromIndex: number, toIndex: number) => {
    setSchema((current) => {
      if (toIndex < 0 || toIndex >= current.fields.length) {
        return current
      }

      const nextFields = [...current.fields]
      const [movedField] = nextFields.splice(fromIndex, 1)

      if (!movedField) {
        return current
      }

      nextFields.splice(toIndex, 0, movedField)
      return {
        ...current,
        fields: nextFields,
      }
    })
  }

  const handleSave = async () => {
    const validationErrors = validateWorkflowInputSchema(schema)
    setErrorMessages(validationErrors)

    if (validationErrors.length > 0) {
      notify({
        title: '无法保存输入参数',
        description: validationErrors[0] ?? '请先修正输入 Schema 中的配置问题。',
        variant: 'error',
      })
      return
    }

    const normalizedSchema = normalizeWorkflowInputSchema(schema)

    try {
      const updatedWorkflow = await updateWorkflow.mutateAsync({
        version: currentWorkflowVersion,
        inputSchema: normalizedSchema,
      })

      setCurrentWorkflowVersion(updatedWorkflow.version)
      setSchema(normalizeWorkflowInputSchema(updatedWorkflow.inputSchema))
      setErrorMessages([])
      notify({
        title: '输入参数已保存',
        description: '工作流输入 Schema 已更新。',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: '保存失败',
        description: error instanceof Error ? error.message : '保存输入 Schema 时发生错误。',
        variant: 'error',
      })
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-surface/95 p-4" data-testid="workflow-input-schema-tab">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-foreground">输入参数</div>
        <p className="text-xs text-muted-foreground">
          支持表单、对话与混合三种收集模式；运行弹窗会复用这里定义的字段、提示与对话计划。
        </p>
      </div>

      {isReadOnly ? (
        <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          当前角色仅可查看输入参数配置，无法编辑或保存。
        </div>
      ) : null}

      {errorMessages.length > 0 ? (
        <div className="rounded-xl border border-error/60 bg-error/10 px-3 py-2 text-xs text-error">
          <ul className="space-y-1">
            {errorMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset disabled={isReadOnly} className="contents">
        <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
          <FieldInput label="收集模式">
            <Select
              value={schema.collectionMode}
              onValueChange={(value) => {
                const nextMode = value as WorkflowInputCollectionMode

                setSchema((current) => ({
                  ...current,
                  collectionMode: nextMode,
                  conversationPlan:
                    nextMode === 'form'
                      ? current.conversationPlan
                      : current.conversationPlan ?? { ...DEFAULT_CONVERSATION_PLAN },
                }))
              }}
              aria-label="收集模式"
              data-testid="input-schema-collection-mode"
            >
              {COLLECTION_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FieldInput>

          <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-xs text-muted-foreground">
            {
              COLLECTION_MODE_OPTIONS.find((option) => option.value === schema.collectionMode)
                ?.description
            }
          </div>
        </div>

        {showsConversationPlan ? (
          <div className="space-y-4 rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">对话计划</h3>
              <p className="text-xs text-muted-foreground">
                对话模式会先展示系统提示词，再按字段顺序结合 collectionHint 逐项追问。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <FieldInput label="系统提示词">
                <textarea
                  className={TEXTAREA_CLASSNAME}
                  value={schema.conversationPlan?.systemPrompt ?? ''}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setSchema((current) => ({
                      ...current,
                      conversationPlan: {
                        ...(current.conversationPlan ?? DEFAULT_CONVERSATION_PLAN),
                        systemPrompt: nextValue,
                      },
                    }))
                  }}
                  aria-label="系统提示词"
                />
              </FieldInput>

              <FieldInput label="最大轮次">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={schema.conversationPlan?.maxTurns ?? DEFAULT_CONVERSATION_PLAN.maxTurns}
                  onChange={(event) => {
                    const nextTurns = Number(event.target.value)
                    setSchema((current) => ({
                      ...current,
                      conversationPlan: {
                        ...(current.conversationPlan ?? DEFAULT_CONVERSATION_PLAN),
                        maxTurns: Number.isFinite(nextTurns) && nextTurns > 0 ? nextTurns : 1,
                      },
                    }))
                  }}
                  aria-label="最大轮次"
                />
              </FieldInput>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Schema 版本 {schema.version} · 工作流版本 {currentWorkflowVersion}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSchema((current) => ({
                ...current,
                fields: [...current.fields, createEmptyWorkflowInputField(current.fields)],
                }))
              }}
              disabled={isReadOnly}
              data-testid="add-input-schema-field"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              添加字段
          </Button>
        </div>

        {schema.fields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
            还没有输入字段。添加字段后，运行对话框会按 schema 渲染输入表单。
          </div>
        ) : null}

        <div className="space-y-4">
          {schema.fields.map((field, index) => {
            const supportsOptions = field.type === 'single_select' || field.type === 'multi_select'
            const visibilityController = field.visibility?.fieldId ?? ''

            return (
              <article
                key={`${field.id}-${index}`}
                className="space-y-4 rounded-xl border border-border/70 bg-background/70 p-4"
                data-testid={`input-schema-field-${index}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">字段 {index + 1}</h3>
                    <p className="text-xs text-muted-foreground">
                      {schema.collectionMode === 'form'
                        ? '配置字段标识、类型、默认值和显示条件。'
                        : schema.collectionMode === 'conversation'
                          ? '字段会作为对话采集目标展示，建议补充 collectionHint 指导逐项追问。'
                          : '字段会先出现在表单阶段，未解决的内容再进入对话阶段继续补充。'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`上移字段 ${index + 1}`}
                      onClick={() => moveField(index, index - 1)}
                      disabled={index === 0}
                      data-testid={`move-input-schema-field-up-${index}`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`下移字段 ${index + 1}`}
                      onClick={() => moveField(index, index + 1)}
                      disabled={index === schema.fields.length - 1}
                      data-testid={`move-input-schema-field-down-${index}`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`删除字段 ${index + 1}`}
                      onClick={() => {
                        setSchema((current) => ({
                          ...current,
                          fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index),
                        }))
                      }}
                      data-testid={`remove-input-schema-field-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                <FieldInput label="字段 ID">
                  <Input
                    value={field.id}
                    onChange={(event) => {
                      const nextId = event.target.value
                      updateField(index, (currentField) => {
                        const nextField = { ...currentField, id: nextId }

                        return nextField
                      })

                      setSchema((current) => ({
                        ...current,
                        fields: current.fields.map((currentField, currentIndex) => {
                          if (
                            currentIndex !== index &&
                            currentField.visibility?.fieldId === field.id &&
                            nextId.trim()
                          ) {
                            return {
                              ...currentField,
                              visibility: {
                                ...currentField.visibility,
                                fieldId: nextId.trim(),
                              },
                            }
                          }

                          return currentField
                        }),
                      }))
                    }}
                    aria-label={`字段 ${index + 1} ID`}
                    data-testid={`input-schema-field-id-${index}`}
                  />
                </FieldInput>

                <FieldInput label="标签">
                  <Input
                    value={field.label}
                    onChange={(event) => {
                      updateField(index, (currentField) => ({
                        ...currentField,
                        label: event.target.value,
                      }))
                    }}
                    aria-label={`字段 ${index + 1} 标签`}
                    data-testid={`input-schema-field-label-${index}`}
                  />
                </FieldInput>

                <FieldInput label="字段类型">
                  <Select
                    value={field.type}
                    onValueChange={(value) => {
                      updateField(index, (currentField) => {
                        const nextType = value as WorkflowInputFieldType
                        return {
                          ...currentField,
                          type: nextType,
                          options:
                            nextType === 'single_select' || nextType === 'multi_select'
                              ? currentField.options
                              : undefined,
                          default: normalizeDefaultValue(nextType, currentField.default),
                          validation: normalizeFieldValidation(nextType, currentField.validation),
                        }
                      })
                    }}
                    aria-label={`字段 ${index + 1} 类型`}
                    data-testid={`input-schema-field-type-${index}`}
                  >
                    {FIELD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FieldInput>

                <FieldInput label="必填">
                  <label className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(event) => {
                        updateField(index, (currentField) => ({
                          ...currentField,
                          required: event.target.checked,
                        }))
                      }}
                      aria-label={`字段 ${index + 1} 必填`}
                      data-testid={`input-schema-field-required-${index}`}
                    />
                    设为必填
                  </label>
                </FieldInput>

                <FieldInput label="描述">
                  <Input
                    value={field.description ?? ''}
                    onChange={(event) => {
                      updateField(index, (currentField) => ({
                        ...currentField,
                        description: event.target.value,
                      }))
                    }}
                    aria-label={`字段 ${index + 1} 描述`}
                    data-testid={`input-schema-field-description-${index}`}
                  />
                </FieldInput>

                <FieldInput
                  label={schema.collectionMode === 'form' ? '收集提示' : 'collectionHint'}
                  className="md:col-span-2"
                >
                  <textarea
                    className={TEXTAREA_CLASSNAME}
                    value={field.collectionHint ?? ''}
                    onChange={(event) => {
                      updateField(index, (currentField) => ({
                        ...currentField,
                        collectionHint: event.target.value,
                      }))
                    }}
                    aria-label={`字段 ${index + 1} 收集提示`}
                    data-testid={`input-schema-field-collection-hint-${index}`}
                  />
                </FieldInput>

                <FieldInput label="默认值">
                  <Input
                    value={formatDefaultValue(field.type, field.default)}
                    onChange={(event) => {
                      updateField(index, (currentField) => ({
                        ...currentField,
                        default: normalizeDefaultValue(currentField.type, event.target.value),
                      }))
                    }}
                    aria-label={`字段 ${index + 1} 默认值`}
                    data-testid={`input-schema-field-default-${index}`}
                  />
                </FieldInput>

                {supportsOptions ? (
                  <FieldInput label="选项（逗号分隔）" className="md:col-span-2">
                    <Input
                      value={formatOptionsInput(field.options)}
                      onChange={(event) => {
                        updateField(index, (currentField) => ({
                          ...currentField,
                          options: parseOptionsInput(event.target.value),
                        }))
                      }}
                      aria-label={`字段 ${index + 1} 选项`}
                      data-testid={`input-schema-field-options-${index}`}
                    />
                  </FieldInput>
                ) : null}

                <FieldInput label="显示条件字段">
                  <Select
                    value={visibilityController}
                    onValueChange={(value) => {
                      updateField(index, (currentField) => ({
                        ...currentField,
                        visibility: value
                          ? {
                              fieldId: value,
                              equals: currentField.visibility?.equals ?? '',
                            }
                          : undefined,
                      }))
                    }}
                    aria-label={`字段 ${index + 1} 显示条件字段`}
                    data-testid={`input-schema-visibility-field-${index}`}
                  >
                    <option value="">始终显示</option>
                    {fieldOptions
                      .filter((option) => option.value !== field.id)
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                  </Select>
                </FieldInput>

                <FieldInput label="显示条件取值">
                  <Input
                    value={field.visibility?.equals === undefined ? '' : String(field.visibility.equals)}
                    onChange={(event) => {
                      const controllerField = schema.fields.find(
                        (candidate) => candidate.id === visibilityController,
                      )

                      updateField(index, (currentField) => {
                        if (!visibilityController) {
                          return {
                            ...currentField,
                            visibility: undefined,
                          }
                        }

                        return {
                          ...currentField,
                          visibility: {
                            fieldId: visibilityController,
                            equals:
                              normalizeVisibilityEquals(event.target.value, controllerField?.type) ?? '',
                          },
                        }
                      })
                    }}
                    aria-label={`字段 ${index + 1} 显示条件取值`}
                    data-testid={`input-schema-visibility-equals-${index}`}
                    disabled={!visibilityController}
                  />
                </FieldInput>

                {field.type === 'text' ? (
                  <>
                    <FieldInput label="最小长度">
                      <Input
                        type="number"
                        value={field.validation?.minLength ?? ''}
                        onChange={(event) => {
                          updateField(index, (currentField) => ({
                            ...currentField,
                            validation: {
                              ...currentField.validation,
                              minLength: toOptionalNumber(event.target.value),
                            },
                          }))
                        }}
                        aria-label={`字段 ${index + 1} 最小长度`}
                      />
                    </FieldInput>

                    <FieldInput label="最大长度">
                      <Input
                        type="number"
                        value={field.validation?.maxLength ?? ''}
                        onChange={(event) => {
                          updateField(index, (currentField) => ({
                            ...currentField,
                            validation: {
                              ...currentField.validation,
                              maxLength: toOptionalNumber(event.target.value),
                            },
                          }))
                        }}
                        aria-label={`字段 ${index + 1} 最大长度`}
                      />
                    </FieldInput>
                  </>
                ) : null}

                {field.type === 'number' ? (
                  <>
                    <FieldInput label="最小值">
                      <Input
                        type="number"
                        value={field.validation?.min ?? ''}
                        onChange={(event) => {
                          updateField(index, (currentField) => ({
                            ...currentField,
                            validation: {
                              ...currentField.validation,
                              min: toOptionalNumber(event.target.value),
                            },
                          }))
                        }}
                        aria-label={`字段 ${index + 1} 最小值`}
                      />
                    </FieldInput>

                    <FieldInput label="最大值">
                      <Input
                        type="number"
                        value={field.validation?.max ?? ''}
                        onChange={(event) => {
                          updateField(index, (currentField) => ({
                            ...currentField,
                            validation: {
                              ...currentField.validation,
                              max: toOptionalNumber(event.target.value),
                            },
                          }))
                        }}
                        aria-label={`字段 ${index + 1} 最大值`}
                      />
                    </FieldInput>
                  </>
                ) : null}
                </div>
              </article>
            )
          })}
        </div>

        {schema.collectionMode !== 'conversation' ? (
          <div
            className="space-y-3 rounded-xl border border-border/70 bg-background/70 p-4"
            data-testid="workflow-input-schema-preview"
          >
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">表单预览</h3>
              <p className="text-xs text-muted-foreground">
                该预览与运行弹窗共用同一套 canonical schema 渲染逻辑，可即时检查默认值与条件显示。
              </p>
            </div>

            <InputSchemaRenderer
              schema={schema}
              values={previewValues}
              readOnly={isReadOnly}
              idPrefix="workflow-input-schema-preview"
              dataTestId="workflow-input-schema-preview-fields"
              emptyState={
                <div className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                  当前 schema 没有可预览的字段，保存后运行弹窗会直接走确认启动流程。
                </div>
              }
              onChange={(fieldId, nextValue) => {
                setPreviewValues((current) => ({
                  ...current,
                  [fieldId]: nextValue,
                }))
              }}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
            对话模式不会直接渲染完整表单；运行时会根据字段顺序、显示条件与 collectionHint 逐项引导用户补全参数。
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={isReadOnly || updateWorkflow.isPending}
            data-testid="save-input-schema"
          >
            {updateWorkflow.isPending ? '保存中...' : '保存输入参数'}
          </Button>
        </div>
      </fieldset>
    </section>
  )
}

function FieldInput({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </div>
  )
}

function toOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeFieldValidation(
  fieldType: WorkflowInputFieldType,
  validation?: WorkflowInputFieldDefinition['validation'],
) {
  if (!validation) {
    return undefined
  }

  if (fieldType === 'text') {
    const nextValidation = {
      minLength: validation.minLength,
      maxLength: validation.maxLength,
    }
    return nextValidation.minLength !== undefined || nextValidation.maxLength !== undefined
      ? nextValidation
      : undefined
  }

  if (fieldType === 'number') {
    const nextValidation = {
      min: validation.min,
      max: validation.max,
    }
    return nextValidation.min !== undefined || nextValidation.max !== undefined
      ? nextValidation
      : undefined
  }

  return undefined
}

function validateWorkflowInputSchema(schema: WorkflowInputSchema): string[] {
  const errors: string[] = []
  const seenIds = new Set<string>()

  if (schema.collectionMode === 'conversation' || schema.collectionMode === 'hybrid') {
    const systemPrompt = schema.conversationPlan?.systemPrompt?.trim() ?? ''
    const maxTurns = schema.conversationPlan?.maxTurns

    if (!systemPrompt) {
      errors.push('对话/混合模式需要填写系统提示词。')
    }

    if (!Number.isInteger(maxTurns) || (maxTurns ?? 0) <= 0) {
      errors.push('对话/混合模式的最大轮次必须是正整数。')
    }
  }

  schema.fields.forEach((field, index) => {
    const fieldPosition = `字段 ${index + 1}`
    const trimmedId = field.id.trim()
    const trimmedLabel = field.label.trim()

    if (!trimmedId) {
      errors.push(`${fieldPosition} 需要填写字段 ID。`)
    } else if (seenIds.has(trimmedId)) {
      errors.push(`${fieldPosition} 的字段 ID 必须唯一。`)
    } else {
      seenIds.add(trimmedId)
    }

    if (!trimmedLabel) {
      errors.push(`${fieldPosition} 需要填写标签。`)
    }

    if (
      (field.type === 'single_select' || field.type === 'multi_select') &&
      (!field.options || field.options.length === 0)
    ) {
      errors.push(`${fieldPosition} 的选项不能为空。`)
    }

    if (field.visibility?.fieldId) {
      const controllerField = schema.fields.find(
        (candidate) => candidate.id === field.visibility?.fieldId,
      )

      if (!controllerField) {
        errors.push(`${fieldPosition} 的显示条件字段不存在。`)
      }

      if (field.visibility.equals === '' || field.visibility.equals === undefined) {
        errors.push(`${fieldPosition} 的显示条件取值不能为空。`)
      }
    }
  })

  return errors
}
