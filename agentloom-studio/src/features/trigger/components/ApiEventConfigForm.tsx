import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { FormField } from '@/shared/components/form-field/FormField'
import { Input } from '@/shared/ui/input'
import { Switch } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'
import type { TriggerDialogFormValues } from './TriggerCreateDialog'

interface ApiEventConfigFormProps {
  register: UseFormRegister<TriggerDialogFormValues>
  watch: UseFormWatch<TriggerDialogFormValues>
  setValue: UseFormSetValue<TriggerDialogFormValues>
  errors: FieldErrors<TriggerDialogFormValues>
}

export function ApiEventConfigForm({
  register,
  watch,
  setValue,
  errors,
}: ApiEventConfigFormProps) {
  const isEnabled = watch('isEnabled')

  return (
    <div className="space-y-5">
      {/* 启用开关独立成行（三种触发器表单统一），不与输入框同排拉伸 */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">启用触发器</p>
          <p className="text-xs text-muted-foreground">切换后立即生效</p>
        </div>
        <Switch
          aria-label="启用触发器"
          checked={isEnabled}
          onCheckedChange={(checked) =>
            setValue('isEnabled', checked, { shouldDirty: true, shouldValidate: true })
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="触发器名称" htmlFor="api-event-trigger-name" error={errors.name?.message}>
          <Input
            id="api-event-trigger-name"
            placeholder="例如：订单状态同步"
            {...register('name')}
          />
        </FormField>

        <FormField
          label="事件源"
          htmlFor="api-event-source"
          error={errors.apiEvent?.eventSource?.message}
        >
          <Input
            id="api-event-source"
            placeholder="例如：order-service"
            {...register('apiEvent.eventSource')}
          />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="事件类型"
          htmlFor="api-event-type"
          error={errors.apiEvent?.eventType?.message}
        >
          <Input
            id="api-event-type"
            placeholder="例如：order.completed"
            {...register('apiEvent.eventType')}
          />
        </FormField>

        <FormField
          label="过滤表达式"
          htmlFor="api-event-filter"
          hint={
            <>
              留空表示不过滤。表达式在服务端沙箱中按 JS 真值判定，可用变量 payload（事件 data）、source、type；
              求值异常按不匹配处理。示例：
              <code className="ml-1 rounded-xs bg-muted px-1.5 py-0.5 font-mono text-foreground/90">
                payload.region == &quot;cn&quot;
              </code>
            </>
          }
        >
          <Input
            id="api-event-filter"
            placeholder={'例如：payload.region == "cn"'}
            {...register('apiEvent.filterExpression')}
          />
        </FormField>
      </div>

      <FormField
        label="签名密钥"
        htmlFor="api-event-secret"
        hint="可选。仅 github 等要求验签的事件源需要填写，服务端据此做 HMAC-SHA256 校验，签名不匹配的事件会被丢弃。"
      >
        <Input
          id="api-event-secret"
          type="password"
          autoComplete="off"
          placeholder="仅需验签的事件源填写"
          {...register('apiEvent.secret')}
        />
      </FormField>

      <FormField
        label="描述"
        htmlFor="api-event-trigger-description"
        error={errors.description?.message}
      >
        <Textarea
          id="api-event-trigger-description"
          rows={3}
          className="resize-none"
          placeholder="说明事件来源、消费目的与触发条件"
          {...register('description')}
        />
      </FormField>
    </div>
  )
}
