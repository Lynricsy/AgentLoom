import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { Label } from '@/shared/ui/label'
import { Input } from '@/shared/ui/input'
import { Switch } from '@/shared/ui/switch'
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">启用触发器</p>
              <p className="text-xs text-muted-foreground">
                切换后立即生效
              </p>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) =>
                setValue('isEnabled', checked, { shouldDirty: true, shouldValidate: true })
              }
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor="api-event-trigger-name" className="space-y-2">
          <Label>触发器名称</Label>
          <Input
            id="api-event-trigger-name"
            placeholder="例如：订单状态同步"
            {...register('name')}
          />
          {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
        </label>

        <label htmlFor="api-event-source" className="space-y-2">
          <Label>事件源</Label>
          <Input
            id="api-event-source"
            placeholder="例如：order-service"
            {...register('apiEvent.eventSource')}
          />
          {errors.apiEvent?.eventSource && (
            <p className="text-xs text-error">{errors.apiEvent.eventSource.message}</p>
          )}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor="api-event-type" className="space-y-2">
          <Label>事件类型</Label>
          <Input
            id="api-event-type"
            placeholder="例如：order.completed"
            {...register('apiEvent.eventType')}
          />
          {errors.apiEvent?.eventType && (
            <p className="text-xs text-error">{errors.apiEvent.eventType.message}</p>
          )}
        </label>

        <label htmlFor="api-event-filter" className="space-y-2">
          <Label>过滤表达式</Label>
          <Input
            id="api-event-filter"
            placeholder={'例如：payload.region == "cn"'}
            {...register('apiEvent.filterExpression')}
          />
        </label>
      </div>

      <label htmlFor="api-event-trigger-description" className="block space-y-2">
        <Label>描述</Label>
        <textarea
          id="api-event-trigger-description"
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          placeholder="说明事件来源、消费目的与触发条件"
          {...register('description')}
        />
        {errors.description && (
          <p className="text-xs text-error">{errors.description.message}</p>
        )}
      </label>
    </div>
  )
}
