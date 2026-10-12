import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { FormField } from '@/shared/components/form-field/FormField'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { Switch } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'
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
  {
    value: 'github',
    id: 'webhook-auth-mode-github',
    title: 'GitHub：校验 GitHub 的 X-Hub-Signature-256 签名',
    description:
      '供 GitHub 仓库 Webhook 直接调用：用 secret 校验签名，同一投递（X-GitHub-Delivery）只启动一次。',
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
      {/* 启用开关独立成行（三种触发器表单统一），不与输入框同排拉伸 */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">启用触发器</p>
          <p className="text-xs text-muted-foreground">关闭后该入口会返回 404，不再接受新的 webhook 请求。</p>
        </div>
        <Switch
          aria-label="启用触发器"
          className="shrink-0"
          checked={isEnabled}
          onCheckedChange={(checked) =>
            setValue('isEnabled', checked, { shouldDirty: true, shouldValidate: true })
          }
        />
      </div>

      <FormField label="触发器名称" htmlFor="webhook-trigger-name" error={errors.name?.message}>
        <Input
          id="webhook-trigger-name"
          placeholder="例如：CRM 回调入口"
          {...register('name')}
        />
      </FormField>

      <FormField label="描述" htmlFor="webhook-trigger-description" error={errors.description?.message}>
        <Textarea
          id="webhook-trigger-description"
          rows={3}
          className="resize-none"
          placeholder="说明这个 webhook 的来源系统与用途"
          {...register('description')}
        />
      </FormField>

      <fieldset>
        <legend id="webhook-auth-mode-label" className="mb-2 text-sm font-medium text-foreground">
          验证模式
        </legend>
        <RadioGroup
          aria-labelledby="webhook-auth-mode-label"
          value={authMode}
          onValueChange={(value) => {
            const option = authModeOptions.find((item) => item.value === value)
            if (option) {
              setValue('webhook.authMode', option.value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          }}
          className="gap-3 md:grid-cols-2"
        >
          {authModeOptions.map((option) => (
            <label
              key={option.value}
              htmlFor={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                authMode === option.value
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border bg-surface hover:border-border-hover',
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

      <FormField
        label="IP 白名单"
        htmlFor="webhook-ip-whitelist"
        error={errors.webhook?.ipWhitelist?.message}
        hint="留空表示不限制来源 IP，支持 IPv4 / IPv6 与 CIDR。来源 IP 不在白名单时请求返回 403。Token 由服务端生成并长期保留；secret 仅会在首次创建成功后展示一次。"
      >
        <Textarea
          id="webhook-ip-whitelist"
          rows={4}
          placeholder={'每行一个 IP 或 CIDR 网段，也可用逗号分隔，例如：\n203.0.113.10\n10.0.0.0/8'}
          className="font-mono"
          {...register('webhook.ipWhitelist')}
        />
      </FormField>

      {webhookConfig ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
          <div>
            <p className="text-sm font-medium text-foreground">当前 Webhook 入口</p>
            <p className="text-xs text-muted-foreground">
              可继续使用当前 URL 与 Token；secret 出于安全原因不会再次显示。
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-primary">
              Webhook URL
            </p>
            <code className="block break-all rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground/90">
              {buildWebhookUrl(webhookConfig.token)}
            </code>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-primary">
              Token
            </p>
            <code className="block break-all rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground/90">
              {webhookConfig.token}
            </code>
          </div>
        </div>
      ) : null}
    </div>
  )
}
