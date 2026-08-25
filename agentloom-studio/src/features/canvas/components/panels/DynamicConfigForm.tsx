import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/shared/ui/input'
import { Switch } from '@/shared/ui/switch'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
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
        continue
      }

      // 自由文本字段以空串起步：受控 <input> 的「未填」就是空串，
      // 这样必填校验命中 `.min(1, '此字段为必填项')` 而不是 zod 的类型缺失文案。
      // 枚举字段不能这么做——非必填枚举是 `z.enum().optional()`，空串会被判非法。
      if (field.type === 'string' && !(field.enum && field.enum.length > 0)) {
        defaults[key] = ''
      }
    }

    return { ...defaults, ...values }
  }, [configSchema, values])

  const form = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues,
    mode: 'onBlur',
  })
  const { reset, trigger, watch } = form

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    const subscription = watch((formValues) => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onApplyRef.current({ config: { ...formValues } })
      }, 300)
    })

    return () => {
      subscription.unsubscribe()
      clearTimeout(debounceRef.current)
    }
  }, [watch])

  // 上报给上层的有效性必须与「用户是否碰过表单」无关:react-hook-form 的
  // formState.errors 只在字段 blur/trigger 后才填充,未交互时为空,若照它上报
  // 会让「必填项为空」的节点被判为合法并放行执行。因此上报值直接由 schema
  // 解析当前值得出;errors 仍只负责字段级错误文案的展示时机。
  const watchedValues = useWatch({ control: form.control })
  const reportedHasErrors = useMemo(
    () => !zodSchema.safeParse({ ...defaultValues, ...watchedValues }).success,
    [defaultValues, watchedValues, zodSchema],
  )
  const onValidationChangeRef = useRef(onValidationChange)
  onValidationChangeRef.current = onValidationChange
  useEffect(() => {
    onValidationChangeRef.current?.(reportedHasErrors)
  }, [reportedHasErrors])

  // 任一字段 blur 都跑整表校验，保证多个必填字段能同时报错
  const handleFieldBlur = useCallback(() => {
    void trigger(undefined, { shouldFocus: false })
  }, [trigger])

  const fields = useMemo(
    () => Object.entries(configSchema.properties),
    [configSchema],
  )

  return (
    <Form {...form}>
      <div className="space-y-5 px-4 py-4" data-testid="dynamic-config-form">
        {fields.map(([key, field]) => (
          <ConfigField
            key={key}
            name={key}
            field={field}
            required={configSchema.required.includes(key)}
            onFieldBlur={handleFieldBlur}
          />
        ))}
      </div>
    </Form>
  )
})

interface ConfigFieldProps {
  name: string
  field: NodeConfigFieldSchema
  required: boolean
  onFieldBlur: () => void
}

const ConfigField = memo(function ConfigField({
  name,
  field,
  required,
  onFieldBlur,
}: ConfigFieldProps) {
  const labelNode = (
    <FormLabel>
      {field.title}
      {required ? <span className="ml-0.5 text-error">*</span> : null}
    </FormLabel>
  )
  const descriptionNode = field.description ? (
    <FormDescription>{field.description}</FormDescription>
  ) : null

  switch (field.type) {
    case 'string': {
      if (field.enum && field.enum.length > 0) {
        const enumOptions = field.enum

        return (
          <FormField
            name={name}
            render={({ field: formField }) => (
              <FormItem>
                {labelNode}
                {descriptionNode}
                <Select
                  value={(formField.value as string) ?? ''}
                  onValueChange={(nextValue) => {
                    formField.onChange(nextValue)
                    onFieldBlur()
                  }}
                >
                  <FormControl>
                    <SelectTrigger
                      aria-label={field.title}
                      onBlur={() => {
                        formField.onBlur()
                        onFieldBlur()
                      }}
                    >
                      <SelectValue placeholder="选择..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {enumOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )
      }

      return (
        <FormField
          name={name}
          render={({ field: formField }) => (
            <FormItem>
              {labelNode}
              {descriptionNode}
              <FormControl>
                <Input
                  aria-label={field.title}
                  placeholder={
                    typeof field.default === 'string' ? field.default : undefined
                  }
                  value={typeof formField.value === 'string' ? formField.value : ''}
                  onChange={formField.onChange}
                  onBlur={() => {
                    formField.onBlur()
                    onFieldBlur()
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )
    }

    case 'number':
      return (
        <FormField
          name={name}
          render={({ field: formField }) => (
            <FormItem>
              {labelNode}
              {descriptionNode}
              <FormControl>
                <Input
                  aria-label={field.title}
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
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )

    case 'boolean':
      return (
        <FormField
          name={name}
          render={({ field: formField }) => (
            <FormItem>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  {labelNode}
                  {descriptionNode}
                </div>
                <FormControl>
                  <Switch
                    aria-label={field.title}
                    checked={!!formField.value}
                    onCheckedChange={formField.onChange}
                    onBlur={() => {
                      formField.onBlur()
                      onFieldBlur()
                    }}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      )

    default:
      return null
  }
})
