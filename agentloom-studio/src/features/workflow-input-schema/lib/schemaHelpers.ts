import type {
  ConversationPlan,
  WorkflowInputFieldDefinition,
  WorkflowInputFieldType,
  WorkflowInputFieldValidation,
  WorkflowInputSchema,
} from '@/features/workflow/types'

export const DEFAULT_CONVERSATION_PLAN: ConversationPlan = {
  systemPrompt: '',
  maxTurns: 10,
}

export const DEFAULT_WORKFLOW_INPUT_SCHEMA: WorkflowInputSchema = {
  version: 1,
  collectionMode: 'form',
  fields: [],
}

export function normalizeWorkflowInputSchema(
  schema?: WorkflowInputSchema | null,
): WorkflowInputSchema {
  const shouldIncludeConversationPlan =
    schema?.collectionMode === 'conversation' ||
    schema?.collectionMode === 'hybrid' ||
    schema?.conversationPlan !== undefined

  return {
    version: schema?.version ?? DEFAULT_WORKFLOW_INPUT_SCHEMA.version,
    collectionMode: schema?.collectionMode ?? DEFAULT_WORKFLOW_INPUT_SCHEMA.collectionMode,
    conversationPlan: shouldIncludeConversationPlan
      ? normalizeConversationPlan(schema?.conversationPlan)
      : undefined,
    fields: (schema?.fields ?? []).map((field) => ({
      id: field.id,
      type: field.type,
      label: field.label,
      description: field.description?.trim() ? field.description.trim() : undefined,
      collectionHint: field.collectionHint?.trim() ? field.collectionHint.trim() : undefined,
      required: field.required ?? false,
      validation: normalizeValidation(field.validation),
      options: normalizeOptions(field.options),
      default: normalizeDefaultValue(field.type, field.default),
      visibility:
        field.visibility?.fieldId && field.visibility.equals !== undefined
          ? {
              fieldId: field.visibility.fieldId,
              equals: field.visibility.equals,
            }
          : undefined,
    })),
  }
}

export function createEmptyWorkflowInputField(
  fields: WorkflowInputFieldDefinition[],
): WorkflowInputFieldDefinition {
  let index = fields.length + 1
  let id = `field_${index}`

  while (fields.some((field) => field.id === id)) {
    index += 1
    id = `field_${index}`
  }

  return {
    id,
    type: 'text',
    label: '',
    required: false,
  }
}

export function parseOptionsInput(value: string): string[] | undefined {
  const options = value
    .split(/[\n,]/)
    .map((option) => option.trim())
    .filter(Boolean)

  return options.length > 0 ? options : undefined
}

export function formatOptionsInput(options?: string[]): string {
  return options?.join(', ') ?? ''
}

export function normalizeVisibilityEquals(
  value: string,
  controllerType?: WorkflowInputFieldType,
): string | number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  if (controllerType === 'number') {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return trimmed
}

export function normalizeDefaultValue(
  fieldType: WorkflowInputFieldType,
  value: unknown,
): unknown {
  if (value === undefined || value === null) {
    return undefined
  }

  if (fieldType === 'number') {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  if (fieldType === 'multi_select') {
    if (!Array.isArray(value)) {
      return undefined
    }

    const values = value
      .map((item) => String(item).trim())
      .filter(Boolean)

    return values.length > 0 ? values : undefined
  }

  const text = String(value).trim()
  return text ? text : undefined
}

export function formatDefaultValue(
  fieldType: WorkflowInputFieldType,
  value: unknown,
): string {
  if (value === undefined || value === null) {
    return ''
  }

  if (fieldType === 'multi_select' && Array.isArray(value)) {
    return value.join(', ')
  }

  return String(value)
}

export function buildLaunchInitialValues(
  schema: WorkflowInputSchema,
): Record<string, unknown> {
  return schema.fields.reduce<Record<string, unknown>>((accumulator, field) => {
    if (field.default !== undefined) {
      accumulator[field.id] = normalizeDefaultValue(field.type, field.default)
      return accumulator
    }

    if (field.type === 'multi_select') {
      accumulator[field.id] = []
      return accumulator
    }

    accumulator[field.id] = ''
    return accumulator
  }, {})
}

export function isWorkflowInputFieldVisible(
  field: WorkflowInputFieldDefinition,
  values: Record<string, unknown>,
): boolean {
  if (!field.visibility) {
    return true
  }

  return values[field.visibility.fieldId] === field.visibility.equals
}

export function sanitizeLaunchInputParams(
  schema: WorkflowInputSchema,
  values: Record<string, unknown>,
): Record<string, unknown> {
  return schema.fields.reduce<Record<string, unknown>>((accumulator, field) => {
    if (!isWorkflowInputFieldVisible(field, values)) {
      return accumulator
    }

    const rawValue = values[field.id]

    const normalizedValue = normalizeLaunchFieldValue(field, rawValue)

    if (normalizedValue === undefined) {
      return accumulator
    }

    accumulator[field.id] = normalizedValue
    return accumulator
  }, {})
}

export function normalizeLaunchFieldValue(
  field: WorkflowInputFieldDefinition,
  rawValue: unknown,
): unknown {
  if (rawValue === undefined || rawValue === null) {
    return undefined
  }

  if (field.type === 'multi_select') {
    if (Array.isArray(rawValue)) {
      const normalized = rawValue
        .map((item) => String(item).trim())
        .filter(Boolean)

      return normalized.length > 0 ? normalized : undefined
    }

    if (typeof rawValue === 'string') {
      return parseOptionsInput(rawValue)
    }

    return undefined
  }

  if (field.type === 'number') {
    if (typeof rawValue === 'number') {
      return Number.isFinite(rawValue) ? rawValue : undefined
    }

    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) {
        return undefined
      }

      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : undefined
    }

    return undefined
  }

  const normalized = String(rawValue).trim()
  return normalized ? normalized : undefined
}

function normalizeOptions(options?: string[]): string[] | undefined {
  if (!options) {
    return undefined
  }

  const normalized = options.map((option) => option.trim()).filter(Boolean)
  return normalized.length > 0 ? normalized : undefined
}

function normalizeValidation(
  validation?: WorkflowInputFieldValidation,
): WorkflowInputFieldValidation | undefined {
  if (!validation) {
    return undefined
  }

  const normalized: WorkflowInputFieldValidation = {}

  if (validation.minLength !== undefined) {
    normalized.minLength = validation.minLength
  }
  if (validation.maxLength !== undefined) {
    normalized.maxLength = validation.maxLength
  }
  if (validation.min !== undefined) {
    normalized.min = validation.min
  }
  if (validation.max !== undefined) {
    normalized.max = validation.max
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeConversationPlan(
  conversationPlan?: ConversationPlan,
): ConversationPlan {
  const normalizedMaxTurns = conversationPlan?.maxTurns

  return {
    systemPrompt: conversationPlan?.systemPrompt?.trim() ?? DEFAULT_CONVERSATION_PLAN.systemPrompt,
    maxTurns:
      typeof normalizedMaxTurns === 'number' &&
      Number.isInteger(normalizedMaxTurns) &&
      normalizedMaxTurns > 0
        ? normalizedMaxTurns
        : DEFAULT_CONVERSATION_PLAN.maxTurns,
  }
}
