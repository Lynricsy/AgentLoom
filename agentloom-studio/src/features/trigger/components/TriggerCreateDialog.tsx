import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CalendarClock, Loader2, RadioTower, Webhook, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import {
  useCreateTrigger,
  useUpdateTrigger,
} from '../api/triggerQueries'
import {
  hasWebhookSecret,
  isApiEventConfig,
  isCronConfig,
  isWebhookConfig,
  type ApiEventTriggerConfig,
  type CreateTriggerData,
  type CronTriggerConfig,
  type Trigger,
  type TriggerType,
  type UpdateTriggerData,
  type WebhookTriggerConfigInput,
} from '../types'
import { ApiEventConfigForm } from './ApiEventConfigForm'
import { CronConfigForm } from './CronConfigForm'
import { WebhookConfigForm } from './WebhookConfigForm'
import { WebhookSecretDisplay } from './WebhookSecretDisplay'

const cronExpressionPattern = /^(\S+\s+){4}\S+$/

const typeOptions: Array<{
  value: TriggerType
  label: string
  description: string
  icon: React.ReactNode
  toneClassName: string
}> = [
  {
    value: 'cron',
    label: 'Cron 定时器',
    description: '按固定时间计划自动运行工作流。',
    icon: <CalendarClock className="h-5 w-5" />,
    toneClassName: 'border-sky-500/20 bg-sky-500/10 text-sky-100 hover:border-sky-400/40',
  },
  {
    value: 'webhook',
    label: 'Webhook',
    description: '为外部系统提供 HTTP 回调入口。',
    icon: <Webhook className="h-5 w-5" />,
    toneClassName: 'border-violet-500/20 bg-violet-500/10 text-violet-100 hover:border-violet-400/40',
  },
  {
    value: 'api_event',
    label: 'API Event（预览）',
    description: '预配置事件契约与过滤条件；当前版本暂不自动触发执行。',
    icon: <RadioTower className="h-5 w-5" />,
    toneClassName: 'border-amber-500/20 bg-amber-500/10 text-amber-100 hover:border-amber-400/40',
  },
]

const formSchema = z
  .object({
    type: z.enum(['cron', 'webhook', 'api_event']),
    name: z.string().trim().min(1, '请输入触发器名称').max(255),
    description: z.string().max(2000),
    isEnabled: z.boolean(),
    cron: z.object({
      expression: z.string(),
      timezone: z.string(),
    }),
    webhook: z.object({
      ipWhitelist: z.string(),
    }),
    apiEvent: z.object({
      eventSource: z.string(),
      eventType: z.string(),
      filterExpression: z.string(),
    }),
  })
  .superRefine((values, ctx) => {
    if (values.type === 'cron') {
      if (!cronExpressionPattern.test(values.cron.expression.trim())) {
        ctx.addIssue({
          code: 'custom',
          path: ['cron', 'expression'],
          message: '请输入 5 段 Cron 表达式',
        })
      }

      if (!values.cron.timezone.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['cron', 'timezone'],
          message: '请选择时区',
        })
      }
    }

    if (values.type === 'webhook') {
      const ipList = parseIpWhitelist(values.webhook.ipWhitelist)
      const invalidIp = ipList.find((item) => !isValidIpAddress(item))

      if (invalidIp) {
        ctx.addIssue({
          code: 'custom',
          path: ['webhook', 'ipWhitelist'],
          message: `IP 地址格式不正确：${invalidIp}`,
        })
      }
    }

    if (values.type === 'api_event') {
      if (!values.apiEvent.eventSource.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['apiEvent', 'eventSource'],
          message: '请输入事件源',
        })
      }

      if (!values.apiEvent.eventType.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['apiEvent', 'eventType'],
          message: '请输入事件类型',
        })
      }
    }
  })

export type TriggerDialogFormValues = z.infer<typeof formSchema>

const ipv4Pattern =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

function isValidIpAddress(value: string): boolean {
  const trimmed = value.trim()

  if (!trimmed) {
    return false
  }

  if (ipv4Pattern.test(trimmed)) {
    return true
  }

  if (!trimmed.includes(':')) {
    return false
  }

  try {
    const parsed = new URL(`http://[${trimmed}]`)
    return parsed.hostname === `[${trimmed}]`
  } catch {
    return false
  }
}

function parseIpWhitelist(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

const API_EVENT_PREVIEW_ONLY_MESSAGE =
  'API Event 当前仅支持预览，不支持创建、编辑或启用触发器。'

function buildFormValues(trigger?: Trigger | null): TriggerDialogFormValues {
  const defaultValues: TriggerDialogFormValues = {
    type: 'cron',
    name: '',
    description: '',
    isEnabled: true,
    cron: {
      expression: '0 9 * * 1-5',
      timezone: 'UTC',
    },
    webhook: {
      ipWhitelist: '',
    },
    apiEvent: {
      eventSource: '',
      eventType: '',
      filterExpression: '',
    },
  }

  if (!trigger) {
    return defaultValues
  }

  const nextValues: TriggerDialogFormValues = {
    ...defaultValues,
    type: trigger.type,
    name: trigger.name,
    description: trigger.description ?? '',
    isEnabled: trigger.isEnabled,
  }

  if (trigger.type === 'cron' && isCronConfig(trigger.config)) {
    nextValues.cron = {
      expression: trigger.config.expression,
      timezone: trigger.config.timezone,
    }
  }

  if (trigger.type === 'webhook' && isWebhookConfig(trigger.config)) {
    nextValues.webhook = {
      ipWhitelist: trigger.config.ipWhitelist.join(', '),
    }
  }

  if (trigger.type === 'api_event' && isApiEventConfig(trigger.config)) {
    nextValues.apiEvent = {
      eventSource: trigger.config.eventSource,
      eventType: trigger.config.eventType,
      filterExpression: trigger.config.filterExpression ?? '',
    }
  }

  return nextValues
}

function buildCreatePayload(values: TriggerDialogFormValues): CreateTriggerData {
  return {
    type: values.type,
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    isEnabled: values.isEnabled,
    config: buildConfigByType(values),
  }
}

function buildUpdatePayload(values: TriggerDialogFormValues): UpdateTriggerData {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    isEnabled: values.isEnabled,
    config: buildConfigByType(values),
  }
}

function buildConfigByType(
  values: TriggerDialogFormValues,
): CronTriggerConfig | WebhookTriggerConfigInput | ApiEventTriggerConfig {
  if (values.type === 'cron') {
    return {
      expression: values.cron.expression.trim(),
      timezone: values.cron.timezone.trim(),
    }
  }

  if (values.type === 'webhook') {
    return {
      ipWhitelist: parseIpWhitelist(values.webhook.ipWhitelist),
    }
  }

  return {
    eventSource: values.apiEvent.eventSource.trim(),
    eventType: values.apiEvent.eventType.trim(),
    filterExpression: values.apiEvent.filterExpression.trim() || undefined,
  }
}

interface TriggerCreateDialogProps {
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: Trigger | null
}

export function TriggerCreateDialog({
  workflowId,
  open,
  onOpenChange,
  trigger,
}: TriggerCreateDialogProps) {
  const { notify } = useToast()
  const createMutation = useCreateTrigger(workflowId)
  const updateMutation = useUpdateTrigger(workflowId)
  const [selectedType, setSelectedType] = useState<TriggerType | null>(
    trigger?.type ?? null,
  )
  const [createdWebhookTrigger, setCreatedWebhookTrigger] = useState<Trigger | null>(null)

  const isEditing = !!trigger
  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const isApiEventPreview = selectedType === 'api_event'

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TriggerDialogFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildFormValues(trigger),
  })

  useEffect(() => {
    if (!open) {
      return
    }

    reset(buildFormValues(trigger))
    setSelectedType(trigger?.type ?? null)
    setCreatedWebhookTrigger(null)
  }, [open, trigger, reset])

  const dialogTitle = useMemo(() => {
    if (createdWebhookTrigger) {
      return '保存 Webhook 凭证'
    }

    return isEditing ? '编辑触发器' : '创建触发器'
  }, [createdWebhookTrigger, isEditing])

  const dialogDescription = useMemo(() => {
    if (createdWebhookTrigger) {
      return 'Token 与 secret 只会在首次创建时重点提示，请立即复制并妥善保管。'
    }

    return isEditing
      ? '修改触发器配置会在下次调度或下次请求时生效。'
      : '先选择触发器类型，再完成具体配置。'
  }, [createdWebhookTrigger, isEditing])

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset(buildFormValues(trigger))
      setSelectedType(trigger?.type ?? null)
      setCreatedWebhookTrigger(null)
    }

    onOpenChange(nextOpen)
  }

  const handleSelectType = (type: TriggerType) => {
    setSelectedType(type)
    setValue('type', type, { shouldDirty: true, shouldValidate: true })
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (values.type === 'api_event') {
        notify({
          title: 'API Event 仍在预览中',
          description: API_EVENT_PREVIEW_ONLY_MESSAGE,
          variant: 'warning',
        })
        return
      }

      if (isEditing && trigger) {
        const updatedTrigger = await updateMutation.mutateAsync({
          triggerId: trigger.id,
          data: buildUpdatePayload(values),
        })

        notify({
          title: '触发器已更新',
          description: `已保存「${updatedTrigger.name}」的新配置。`,
          variant: 'success',
        })
        handleDialogOpenChange(false)
        return
      }

      const createdTrigger = await createMutation.mutateAsync(buildCreatePayload(values))

      notify({
        title: '触发器已创建',
        description: `已创建「${createdTrigger.name}」。`,
        variant: 'success',
      })

      if (createdTrigger.type === 'webhook' && hasWebhookSecret(createdTrigger.config)) {
        setCreatedWebhookTrigger(createdTrigger)
        return
      }

      handleDialogOpenChange(false)
    } catch (error) {
      notify({
        title: isEditing ? '更新触发器失败' : '创建触发器失败',
        description:
          error instanceof Error ? error.message : '请稍后重试。',
        variant: 'error',
      })
    }
  })

  return (
    <Dialog.Root open={open} onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 top-3 h-8 w-8 p-0"
              aria-label="关闭触发器对话框"
            >
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>

          <Dialog.Title className="text-base font-semibold text-foreground">
            {dialogTitle}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {dialogDescription}
          </Dialog.Description>

          {createdWebhookTrigger?.type === 'webhook' && hasWebhookSecret(createdWebhookTrigger.config) ? (
            <div className="mt-5 space-y-5">
              <WebhookSecretDisplay
                token={createdWebhookTrigger.config.token}
                secret={createdWebhookTrigger.config.secret}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                  完成
                </Button>
              </div>
            </div>
          ) : selectedType ? (
            <form onSubmit={onSubmit} className="mt-5 space-y-5">
              {!isEditing ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/40 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">当前类型</p>
                    <p className="text-xs text-muted-foreground">
                      {typeOptions.find((option) => option.value === selectedType)?.label}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSelectedType(null)}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    重新选择
                  </Button>
                </div>
              ) : null}

              {selectedType === 'cron' ? (
                <CronConfigForm
                  register={register}
                  watch={watch}
                  setValue={setValue}
                  errors={errors}
                />
              ) : null}

              {selectedType === 'webhook' ? (
                <WebhookConfigForm
                  register={register}
                  watch={watch}
                  setValue={setValue}
                  errors={errors}
                  trigger={trigger}
                />
              ) : null}

              {selectedType === 'api_event' ? (
                <ApiEventConfigForm
                  register={register}
                  watch={watch}
                  setValue={setValue}
                  errors={errors}
                  disabled
                />
              ) : null}

              {isApiEventPreview ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {API_EVENT_PREVIEW_ONLY_MESSAGE}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close asChild>
                  <Button variant="outline">取消</Button>
                </Dialog.Close>
                <Button type="submit" className="gap-2" disabled={isSubmitting || isApiEventPreview}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isApiEventPreview ? 'API Event 预览中' : isEditing ? '保存更改' : '创建触发器'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${option.toneClassName}`}
                    onClick={() => handleSelectType(option.value)}
                  >
                    <div className="inline-flex items-center gap-2 text-sm font-medium">
                      {option.icon}
                      {option.label}
                    </div>
                    <p className="mt-3 text-sm text-current/80">{option.description}</p>
                  </button>
                ))}
              </div>

              <div className="flex justify-end">
                <Dialog.Close asChild>
                  <Button variant="outline">取消</Button>
                </Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
