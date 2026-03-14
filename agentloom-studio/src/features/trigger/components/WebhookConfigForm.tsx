import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { Label } from '@/shared/ui/label'
import { Input } from '@/shared/ui/input'
import { Switch } from '@/shared/ui/switch'
import { isWebhookConfig, type Trigger } from '../types'
import { WebhookSecretDisplay } from './WebhookSecretDisplay'
import type { TriggerDialogFormValues } from './TriggerCreateDialog'

interface WebhookConfigFormProps {
  register: UseFormRegister<TriggerDialogFormValues>
  watch: UseFormWatch<TriggerDialogFormValues>
  setValue: UseFormSetValue<TriggerDialogFormValues>
  errors: FieldErrors<TriggerDialogFormValues>
  trigger?: Trigger | null
}

export function WebhookConfigForm({
  register,
  watch,
  setValue,
  errors,
  trigger,
}: WebhookConfigFormProps) {
  const isEnabled = watch('isEnabled')
  const webhookConfig =
    trigger?.type === 'webhook' && isWebhookConfig(trigger.config) ? trigger.config : null

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor="webhook-trigger-name" className="space-y-2">
          <Label>触发器名称</Label>
          <Input
            id="webhook-trigger-name"
            placeholder="例如：CRM 回调入口"
            {...register('name')}
          />
          {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
        </label>

        <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">启用触发器</p>
              <p className="text-xs text-muted-foreground">关闭后 webhook 请求会被忽略。</p>
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

      <label htmlFor="webhook-trigger-description" className="block space-y-2">
        <Label>描述</Label>
        <textarea
          id="webhook-trigger-description"
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          placeholder="说明这个 webhook 的来源系统与用途"
          {...register('description')}
        />
        {errors.description && (
          <p className="text-xs text-error">{errors.description.message}</p>
        )}
      </label>

      <label htmlFor="webhook-ip-whitelist" className="block space-y-2">
        <Label>IP 白名单</Label>
        <Input
          id="webhook-ip-whitelist"
          placeholder="多个 IP 使用逗号分隔，例如：192.168.1.10, 10.0.0.5"
          {...register('webhook.ipWhitelist')}
        />
        <p className="text-xs text-muted-foreground">
          留空表示不限制来源 IP。Token 与 secret 会在创建后由服务端自动生成。
        </p>
        {errors.webhook?.ipWhitelist && (
          <p className="text-xs text-error">{errors.webhook.ipWhitelist.message}</p>
        )}
      </label>

      {webhookConfig ? (
        <WebhookSecretDisplay token={webhookConfig.token} secret={webhookConfig.secret} />
      ) : null}
    </div>
  )
}
