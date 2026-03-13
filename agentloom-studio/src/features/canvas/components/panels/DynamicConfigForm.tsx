import { memo, useCallback, useEffect, useMemo, useRef, type FocusEvent } from 'react'
import {
  Controller,
  useForm,
  type Control,
  type FieldValues,
  type UseFormRegister,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select } from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import type {
  NodeConfigFieldSchema,
  NodeConfigSchema,
} from '../../types/nodeTypeRegistry'
import { configSchemaToZod } from '../../lib/configSchemaToZod'

type DynamicConfigZodSchema = NonNullable<ReturnType<typeof configSchemaToZod>>

interface DynamicConfigFormProps {
  configSchema: NodeConfigSchema
  values: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
  onValidationChange?: (hasErrors: boolean) => void
}

export const DynamicConfigForm = memo(function DynamicConfigForm({
  configSchema,
  values,
  onApply,
  onValidationChange,
}: DynamicConfigFormProps) {
  const zodSchema = useMemo(
    () => configSchemaToZod(configSchema),
    [configSchema],
  )

  if (!zodSchema) {
    return null
  }

  return (
    <DynamicFormInner
      configSchema={configSchema}
      zodSchema={zodSchema}
      values={values}
      onApply={onApply}
      onValidationChange={onValidationChange}
    />
  )
})

interface DynamicFormInnerProps {
  configSchema: NodeConfigSchema
  zodSchema: DynamicConfigZodSchema
  values: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
  onValidationChange?: (hasErrors: boolean) => void
}

const DynamicFormInner = memo(function DynamicFormInner({
  configSchema,
  zodSchema,
  values,
  onApply,
  onValidationChange,
}: DynamicFormInnerProps) {
  const defaultValues = useMemo(() => {
    const defaults: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(configSchema.properties)) {
      if (field.default !== undefined) {
        defaults[key] = field.default
      }
    }

    return { ...defaults, ...values }
  }, [configSchema, values])

  const {
    control,
    register,
    reset,
    trigger,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues,
    mode: 'onBlur',
  })

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    reset(defaultValues)
  }, [defaultValues, reset])

  const onApplyRef = useRef(onApply)
  onApplyRef.current = onApply

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const subscription = watch((formValues) => {
      const activeTimer = debounceRef.current
      if (activeTimer !== null) {
        clearTimeout(activeTimer)
      }
      debounceRef.current = setTimeout(() => {
        onApplyRef.current({ config: { ...formValues } })
      }, 300)
    })

    return () => {
      subscription.unsubscribe()
      const activeTimer = debounceRef.current
      if (activeTimer !== null) {
        clearTimeout(activeTimer)
      }
    }
  }, [watch])

  const hasErrors = Object.keys(errors).length > 0
  const onValidationChangeRef = useRef(onValidationChange)
  onValidationChangeRef.current = onValidationChange
  useEffect(() => {
    onValidationChangeRef.current?.(hasErrors)
  }, [hasErrors])

  const handleFieldBlur = useCallback(() => {
    void trigger(undefined, { shouldFocus: false })
  }, [trigger])

  const fields = useMemo(
    () => Object.entries(configSchema.properties),
    [configSchema],
  )

  return (
    <div className="space-y-4 px-4 py-4" data-testid="dynamic-config-form">
      {fields.map(([key, field]) => (
        <ConfigField
          key={key}
          name={key}
          field={field}
          required={configSchema.required.includes(key)}
          control={control}
          register={register}
          onFieldBlur={handleFieldBlur}
          error={(errors[key] as { message?: string } | undefined)?.message}
        />
      ))}
    </div>
  )
})

interface ConfigFieldProps {
  name: string
  field: NodeConfigFieldSchema
  required: boolean
  control: Control<FieldValues>
  register: UseFormRegister<FieldValues>
  onFieldBlur: () => void
  error?: string
}

const ConfigField = memo(function ConfigField({
  name,
  field,
  required,
  control,
  register,
  onFieldBlur,
  error,
}: ConfigFieldProps) {
  const fieldTitle = (
    <span className="inline-flex items-center gap-1">
      <Label>{field.title}</Label>
      {required ? <span className="text-error">*</span> : null}
    </span>
  )

  switch (field.type) {
    case 'string': {
      if (field.enum && field.enum.length > 0) {
        const enumOptions = field.enum

        return (
          <Controller
            name={name}
            control={control}
            render={({ field: formField }) => (
              <div>
                {fieldTitle}
                {field.description && (
                  <p className="mb-1 text-xs text-muted-foreground">
                    {field.description}
                  </p>
                )}
                <Select
                  aria-label={field.title}
                  id={name}
                  value={(formField.value as string) ?? ''}
                  onValueChange={formField.onChange}
                  onBlur={() => {
                    formField.onBlur()
                    onFieldBlur()
                  }}
                >
                  <option value="" disabled>
                    选择...
                  </option>
                  {enumOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
                {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
              </div>
            )}
          />
        )
      }

      const registration = register(name)

      return (
        <div>
          {fieldTitle}
          {field.description && (
            <p className="mb-1 text-xs text-muted-foreground">
              {field.description}
            </p>
          )}
          <Input
            aria-label={field.title}
            id={name}
            placeholder={typeof field.default === 'string' ? field.default : undefined}
            {...registration}
            onBlur={(event: FocusEvent<HTMLInputElement>) => {
              registration.onBlur(event)
              onFieldBlur()
            }}
          />
          {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
        </div>
      )
    }

    case 'number':
      return (
        <Controller
          name={name}
          control={control}
          render={({ field: formField }) => (
            <div>
              {fieldTitle}
              {field.description && (
                <p className="mb-1 text-xs text-muted-foreground">
                  {field.description}
                </p>
              )}
              <Input
                aria-label={field.title}
                id={name}
                type="number"
                value={typeof formField.value === 'number' ? formField.value : ''}
                onChange={(event) => {
                  const value = event.target.value
                  formField.onChange(value === '' ? undefined : Number(value))
                }}
                onBlur={() => {
                  formField.onBlur()
                  onFieldBlur()
                }}
              />
              {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
            </div>
          )}
        />
      )

    case 'boolean':
      return (
        <Controller
          name={name}
          control={control}
          render={({ field: formField }) => (
            <div className="flex items-center justify-between">
              <div>
                {fieldTitle}
                {field.description && (
                  <p className="text-xs text-muted-foreground">
                    {field.description}
                  </p>
                )}
              </div>
              <Switch
                aria-label={field.title}
                id={name}
                checked={!!formField.value}
                onCheckedChange={formField.onChange}
                onBlur={() => {
                  formField.onBlur()
                  onFieldBlur()
                }}
              />
            </div>
          )}
        />
      )

    default:
      return null
  }
})
