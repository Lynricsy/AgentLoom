import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { cn } from '@/shared/lib/utils'
import { Label } from '@/shared/ui/label'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Switch } from '@/shared/ui/switch'
import { isWebhookConfig, type Trigger, type WebhookAuthMode } from '../types'
import { buildWebhookUrl } from './WebhookSecretDisplay'
import type { TriggerDialogFormValues } from './TriggerCreateDialog'

const authModeOptions: Array<{
  value: WebhookAuthMode
  id: string
  title: string
  description: string
}> = [
  {
    value: 'simple',
    id: 'webhook-auth-mode-simple',
    title: 'Simple：仅校验 Token 与 IP 白名单',
    description: '调用方携带正确的 Token 即可触发，适合内网或已受信的来源系统。',
  },
  {
    value: 'signed',
    id: 'webhook-auth-mode-signed',
    title: 'Signed：额外要求 HMAC-SHA256 签名与时间戳校验',
    description: '调用方需用 secret 对请求体签名并携带时间戳，可防篡改与重放，更安全。',
  },
]

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
  const authMode = watch('webhook.authMode')
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
              <p className="text-xs text-muted-foreground">关闭后该入口会返回 404，不再接受新的 webhook 请求。</p>
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

      <fieldset>
        <legend id="webhook-auth-mode-label" className="mb-2 text-sm font-medium text-foreground">
          验证模式
        </legend>
        <RadioGroup
          aria-labelledby="webhook-auth-mode-label"
          value={authMode}
          onValueChange={(value) =>
            setValue('webhook.authMode', value === 'signed' ? 'signed' : 'simple', {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          className="gap-3 md:grid-cols-2"
        >
          {authModeOptions.map((option) => (
            <label
              key={option.value}
              htmlFor={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                authMode === option.value
                  ? 'border-violet-400/50 bg-violet-500/10'
                  : 'border-border/60 bg-background/60 hover:border-border',
              )}
            >
              <RadioGroupItem id={option.id} value={option.value} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{option.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <label htmlFor="webhook-ip-whitelist" className="block space-y-2">
        <Label>IP 白名单</Label>
        <Input
          id="webhook-ip-whitelist"
          placeholder="多个 IP 使用逗号分隔，例如：192.168.1.10, 10.0.0.5"
          {...register('webhook.ipWhitelist')}
        />
        <p className="text-xs text-muted-foreground">
          留空表示不限制来源 IP。Token 由服务端生成并长期保留；secret 仅会在首次创建成功后展示一次。
        </p>
        {errors.webhook?.ipWhitelist && (
          <p className="text-xs text-error">{errors.webhook.ipWhitelist.message}</p>
        )}
      </label>

      {webhookConfig ? (
        <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">当前 Webhook 入口</p>
            <p className="text-xs text-muted-foreground">
              可继续使用当前 URL 与 Token；secret 出于安全原因不会再次显示。
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">
              Webhook URL
            </p>
            <code className="block break-all rounded-lg border border-border/70 bg-black/20 px-3 py-2 text-xs text-foreground/90">
              {buildWebhookUrl(webhookConfig.token)}
            </code>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">
              Token
            </p>
            <code className="block break-all rounded-lg border border-border/70 bg-black/20 px-3 py-2 text-xs text-foreground/90">
              {webhookConfig.token}
            </code>
          </div>
        </div>
      ) : null}
    </div>
  )
}
