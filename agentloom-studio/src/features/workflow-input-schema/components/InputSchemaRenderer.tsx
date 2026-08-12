import type { WorkflowInputSchema } from '@/features/workflow/types'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { isWorkflowInputFieldVisible } from '../lib/schemaHelpers'

interface InputSchemaRendererProps {
  schema: WorkflowInputSchema
  values: Record<string, unknown>
  errors?: Record<string, string>
  onChange?: (fieldId: string, value: unknown) => void
  readOnly?: boolean
  className?: string
  emptyState?: React.ReactNode
  idPrefix?: string
  dataTestId?: string
}

export function InputSchemaRenderer({
  schema,
  values,
  errors = {},
  onChange,
  readOnly = false,
  className,
  emptyState,
  idPrefix = 'input-schema-renderer',
  dataTestId,
}: InputSchemaRendererProps) {
  const visibleFields = schema.fields.filter((field) => isWorkflowInputFieldVisible(field, values))

  if (visibleFields.length === 0) {
    return emptyState ? <>{emptyState}</> : null
  }

  return (
    <div className={cn('space-y-4', className)} data-testid={dataTestId}>
      {visibleFields.map((field) => (
        <RendererField
          key={field.id}
          field={field}
          value={values[field.id]}
          error={errors[field.id]}
          onChange={onChange}
          readOnly={readOnly}
          idPrefix={idPrefix}
        />
      ))}
    </div>
  )
}

function RendererField({
  field,
  value,
  error,
  onChange,
  readOnly,
  idPrefix,
}: {
  field: WorkflowInputSchema['fields'][number]
  value: unknown
  error?: string
  onChange?: (fieldId: string, value: unknown) => void
  readOnly: boolean
  idPrefix: string
}) {
  const descriptionId = field.description ? `${idPrefix}-${field.id}-description` : undefined
  const errorId = error ? `${idPrefix}-${field.id}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined
  const isDisabled = readOnly || !onChange

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="block text-xs font-medium text-foreground">{field.label}</span>
        {field.required ? <span className="text-[11px] text-warning">必填</span> : null}
      </div>

      {field.type === 'text' ? (
        <Input
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange?.(field.id, event.target.value)}
          aria-label={field.label}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          disabled={isDisabled}
        />
      ) : null}

      {field.type === 'number' ? (
        <Input
          type="number"
          value={typeof value === 'number' && !Number.isNaN(value) ? String(value) : ''}
          onChange={(event) => {
            const nextValue = event.target.value.trim()
            onChange?.(field.id, nextValue ? Number(nextValue) : '')
          }}
          aria-label={field.label}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          disabled={isDisabled}
        />
      ) : null}

      {field.type === 'single_select' ? (
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(nextValue) => {
            onChange?.(field.id, nextValue)
          }}
          disabled={isDisabled}
        >
          <SelectTrigger
            aria-label={field.label}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={describedBy}
          >
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {field.type === 'multi_select' ? (
        <div className="space-y-2 rounded-md border border-input bg-background px-3 py-2">
          {(field.options ?? []).map((option) => {
            const currentValues = Array.isArray(value)
              ? value.map(String).filter((currentValue) => (field.options ?? []).includes(currentValue))
              : []
            const checked = currentValues.includes(option)

            return (
              <label key={option} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const nextValues = event.target.checked
                      ? [...currentValues, option]
                      : currentValues.filter((currentValue) => currentValue !== option)
                    onChange?.(field.id, nextValues)
                  }}
                  aria-label={`${field.label}-${option}`}
                  disabled={isDisabled}
                />
                {option}
              </label>
            )
          })}
        </div>
      ) : null}

      {field.description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {field.description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
