import { memo, useEffect, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select } from '@/shared/ui/select'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

const httpToolSchema = z.object({
  url: z.string().min(1, '此字段为必填项'),
  method: z.enum(HTTP_METHODS),
})

type HttpToolFormValues = z.infer<typeof httpToolSchema>

interface HttpToolConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
  onValidationChange?: (hasErrors: boolean) => void
}

export const HttpToolConfigPanel = memo(function HttpToolConfigPanel({
  config,
  onApply,
  onValidationChange,
}: HttpToolConfigPanelProps) {
  const {
    register,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm<HttpToolFormValues>({
    resolver: zodResolver(httpToolSchema),
    defaultValues: {
      url: (config.url as string) ?? '',
      method: (config.method as HttpToolFormValues['method']) ?? 'GET',
    },
    mode: 'onBlur',
  })

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    reset({
      url: (config.url as string) ?? '',
      method: (config.method as HttpToolFormValues['method']) ?? 'GET',
    })
  }, [config, reset])

  const onApplyRef = useRef(onApply)
  onApplyRef.current = onApply
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const subscription = watch((values) => {
      const activeTimer = debounceRef.current
      if (activeTimer !== null) {
        clearTimeout(activeTimer)
      }
      debounceRef.current = setTimeout(() => {
        onApplyRef.current({ config: { ...values } })
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
  useEffect(() => {
    onValidationChange?.(hasErrors)
  }, [hasErrors, onValidationChange])

  return (
    <div className="space-y-4 px-4 py-4" data-testid="http-tool-config-panel">
      <div>
        <Label>Method</Label>
        <Controller
          name="method"
          control={control}
          render={({ field }) => (
            <Select
              aria-label="Method"
              id="method"
              value={field.value}
              onValueChange={(v) => field.onChange(v)}
              onBlur={field.onBlur}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          )}
        />
        {errors.method && (
          <p className="mt-1 text-xs text-error">{errors.method.message}</p>
        )}
      </div>

      <div>
        <span className="inline-flex items-center gap-1">
          <Label>URL</Label>
          <span className="text-error">*</span>
        </span>
        <p className="mb-1 text-xs text-muted-foreground">
          请求目标地址
        </p>
        <Input
          aria-label="URL"
          id="url"
          required
          placeholder="https://api.example.com/endpoint"
          {...register('url')}
        />
        {errors.url && (
          <p className="mt-1 text-xs text-error">{errors.url.message}</p>
        )}
      </div>
    </div>
  )
})
