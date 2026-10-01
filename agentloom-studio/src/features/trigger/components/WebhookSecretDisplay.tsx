import { useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import type { WebhookAuthMode } from '../types'

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

/** 与 server `trigger.constants.ts` 的 WEBHOOK_SIGNATURE_HEADER / WEBHOOK_TIMESTAMP_HEADER 对应 */
const SIGNATURE_HEADER = 'X-AgentLoom-Signature'
const TIMESTAMP_HEADER = 'X-AgentLoom-Timestamp'
/** 与 server WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS 对应 */
const TIMESTAMP_TOLERANCE_SECONDS = 300
/** 与 server `trigger.constants.ts` 的 GITHUB_SIGNATURE_HEADER / GITHUB_DELIVERY_HEADER 对应 */
const GITHUB_SIGNATURE_HEADER = 'X-Hub-Signature-256'
const GITHUB_DELIVERY_HEADER = 'X-GitHub-Delivery'

function buildSignedCurlExample(webhookUrl: string): string {
  return [
    'SECRET=<上面的 Secret>',
    `BODY='{"hello":"world"}'`,
    'TS=$(date +%s)',
    `SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')`,
    `curl -X POST '${webhookUrl}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H "${TIMESTAMP_HEADER}: $TS" \\`,
    `  -H "${SIGNATURE_HEADER}: $SIG" \\`,
    '  -d "$BODY"',
  ].join('\n')
}

interface WebhookSecretDisplayProps {
  token: string
  secret: string
  authMode: WebhookAuthMode
  className?: string
}

export function WebhookSecretDisplay({
  token,
  secret,
  authMode,
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
          请立即保存以下凭证，secret 只在本次创建后展示。
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

      {authMode === 'signed' ? (
        <div
          className="rounded-lg border border-border/60 bg-background/60 p-3 text-xs leading-6 text-muted-foreground"
          data-testid="webhook-signature-guide"
        >
          <p className="font-medium text-foreground">调用方如何签名</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              取当前 Unix 秒级时间戳，放入请求头{' '}
              <span className="font-mono text-foreground">{TIMESTAMP_HEADER}</span>
              （与服务器时间相差不超过 {TIMESTAMP_TOLERANCE_SECONDS} 秒）
            </li>
            <li>
              用 secret 对字符串{' '}
              <span className="font-mono text-foreground">{'{timestamp}.{原始请求体}'}</span>{' '}
              计算 HMAC-SHA256，取小写十六进制
            </li>
            <li>
              把结果放入请求头{' '}
              <span className="font-mono text-foreground">{SIGNATURE_HEADER}</span>
              ；请求体必须与参与签名的字节完全一致
            </li>
          </ol>
          <pre className="mt-3 overflow-x-auto rounded-md bg-black/30 px-3 py-2 text-[11px] leading-5 text-violet-50">
            {buildSignedCurlExample(webhookUrl)}
          </pre>
        </div>
      ) : authMode === 'github' ? (
        <div
          className="rounded-lg border border-border/60 bg-background/60 p-3 text-xs leading-6 text-muted-foreground"
          data-testid="webhook-signature-guide"
        >
          <p className="font-medium text-foreground">在 GitHub 中配置</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>打开 GitHub 仓库 Settings → Webhooks → Add webhook</li>
            <li>
              Payload URL 填上面的 Webhook URL
            </li>
            <li>
              Content type 选{' '}
              <span className="font-mono text-foreground">application/json</span>
            </li>
            <li>Secret 填上面的 Secret</li>
            <li>选择要触发的事件后保存；GitHub 随即发送的 ping 只验签、不启动工作流</li>
          </ol>
          <p className="mt-2">
            服务端用 Secret 校验{' '}
            <span className="font-mono text-foreground">{GITHUB_SIGNATURE_HEADER}</span>
            ；同一投递（<span className="font-mono text-foreground">{GITHUB_DELIVERY_HEADER}</span>
            ）24 小时内只启动一次。事件类型与投递 ID 以{' '}
            <span className="font-mono text-foreground">_eventType</span>、
            <span className="font-mono text-foreground">_deliveryId</span> 传入启动参数。
          </p>
        </div>
      ) : (
        <div
          className="rounded-lg border border-border/60 bg-background/60 p-3 text-xs leading-6 text-muted-foreground"
          data-testid="webhook-signature-guide"
        >
          <p className="font-medium text-foreground">Simple 模式无需签名</p>
          <p className="mt-1">
            Token 已包含在 URL 中，向该 URL 发送 POST 请求即可触发；secret 仅在改为 Signed 或 GitHub 模式后用于签名。
          </p>
        </div>
      )}
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
