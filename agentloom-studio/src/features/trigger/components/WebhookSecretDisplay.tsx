import { useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'

function normalizeApiBaseUrl(rawBaseUrl: string | undefined): string {
  const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const baseUrl = (rawBaseUrl?.trim() || '/api/v1').replace(/\/+$/, '')

  const resolvedBaseUrl = baseUrl.startsWith('http')
    ? baseUrl
    : `${fallbackOrigin}${baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`}`

  if (/\/api\/v1$/i.test(resolvedBaseUrl)) {
    return resolvedBaseUrl
  }

  return `${resolvedBaseUrl}/api/v1`
}

export function buildWebhookUrl(token: string): string {
  const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)

  return `${apiBaseUrl}/webhooks/${token}`
}

interface WebhookSecretDisplayProps {
  token: string
  secret: string
  className?: string
}

export function WebhookSecretDisplay({
  token,
  secret,
  className,
}: WebhookSecretDisplayProps) {
  const { notify } = useToast()
  const [isSecretVisible, setIsSecretVisible] = useState(false)

  const webhookUrl = useMemo(() => buildWebhookUrl(token), [token])

  const handleCopy = async (value: string, label: string) => {
    if (!navigator?.clipboard?.writeText) {
      notify({
        title: '复制失败',
        description: '当前环境不支持剪贴板复制，请手动复制。',
        variant: 'warning',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(value)
      notify({
        title: `${label}已复制`,
        description: '已复制到剪贴板。',
        variant: 'success',
      })
    } catch {
      notify({
        title: '复制失败',
        description: `无法复制${label}，请稍后重试。`,
        variant: 'error',
      })
    }
  }

  return (
    <section
      className={cn(
        'space-y-4 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4',
        className,
      )}
    >
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-violet-200">
          <KeyRound className="h-3.5 w-3.5" />
          Webhook 凭证
        </div>
        <p className="text-sm text-foreground">
          请立即保存以下凭证。服务端会使用 secret 对请求体进行 HMAC-SHA256 签名。
        </p>
      </div>

      <CredentialField
        icon={<LinkIcon className="h-4 w-4" />}
        label="Webhook URL"
        value={webhookUrl}
        copyLabel="Webhook URL"
        onCopy={handleCopy}
      />

      <CredentialField
        icon={<KeyRound className="h-4 w-4" />}
        label="Token"
        value={token}
        copyLabel="Token"
        onCopy={handleCopy}
      />

      <CredentialField
        icon={isSecretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        label="Secret"
        value={secret}
        displayValue={isSecretVisible ? secret : '•'.repeat(Math.max(secret.length, 24))}
        copyLabel="Secret"
        onCopy={handleCopy}
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-violet-100 hover:bg-violet-500/20"
            onClick={() => setIsSecretVisible((current) => !current)}
          >
            {isSecretVisible ? '隐藏' : '显示'}
          </Button>
        }
      />

      <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-xs leading-6 text-muted-foreground">
        <p className="font-medium text-foreground">签名校验说明</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>读取请求头 <span className="font-mono text-foreground">X-AgentLoom-Signature</span></li>
          <li>使用原始请求体与 secret 计算 HMAC-SHA256</li>
          <li>将结果与请求头中的签名进行常量时间比较</li>
        </ol>
      </div>
    </section>
  )
}

interface CredentialFieldProps {
  icon: React.ReactNode
  label: string
  value: string
  displayValue?: string
  copyLabel: string
  action?: React.ReactNode
  onCopy: (value: string, label: string) => Promise<void>
}

function CredentialField({
  icon,
  label,
  value,
  displayValue,
  copyLabel,
  action,
  onCopy,
}: CredentialFieldProps) {
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
          <span className="text-violet-200">{icon}</span>
          {label}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => void onCopy(value, copyLabel)}
          >
            <Copy className="h-3.5 w-3.5" />
            复制
          </Button>
        </div>
      </div>
      <code className="block overflow-x-auto rounded-md bg-black/30 px-3 py-2 text-xs text-violet-50">
        {displayValue ?? value}
      </code>
    </div>
  )
}
