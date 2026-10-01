import { memo, useState } from 'react'
import { Copy, KeyRound, Link as LinkIcon, Webhook } from 'lucide-react'
import { useCanvasStore } from '../../stores/canvasStore'
import { useTriggers, isWebhookConfig, hasWebhookSecret } from '@/features/trigger'
import { buildWebhookUrl } from '@/features/trigger'

type AuthMode = 'simple' | 'signed'

const AUTH_MODE_LABELS: Record<AuthMode, string> = {
  simple: '简单模式（仅校验 Token 与 IP 白名单）',
  signed: '签名验证（HMAC-SHA256 + 时间戳）',
}

/**
 * 画布节点只展示已部署 Webhook 触发器的生效配置。鉴权模式与 IP 白名单的唯一编辑入口是
 * 「工作流设置 → 触发器」：节点 data.config 不会同步到 workflow_triggers，在这里编辑不生效。
 */
export const WebhookTriggerConfigPanel = memo(function WebhookTriggerConfigPanel() {
  const workflowId = useCanvasStore((s) => s.workflowId)

  const { data: triggersResult } = useTriggers(workflowId ?? '', { type: 'webhook' })
  const deployedTrigger = triggersResult?.data?.[0] ?? null
  const deployedWebhookConfig =
    deployedTrigger && isWebhookConfig(deployedTrigger.config)
      ? deployedTrigger.config
      : null

  return (
    <div className="space-y-4 px-4 py-4" data-testid="webhook-trigger-config-panel">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-warning" />
        <span className="text-xs font-medium text-foreground">Webhook 触发器</span>
      </div>

      {deployedWebhookConfig && deployedTrigger ? (
        <DeployedWebhookInfo
          token={deployedWebhookConfig.token}
          secret={hasWebhookSecret(deployedTrigger.config) ? deployedTrigger.config.secret : null}
          // 历史触发器缺省 authMode 时服务端按 signed 处理
          authMode={deployedWebhookConfig.authMode ?? 'signed'}
          ipWhitelist={deployedWebhookConfig.ipWhitelist}
          isEnabled={deployedTrigger.isEnabled}
        />
      ) : (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          尚未创建 Webhook 触发器。发布工作流后，在「工作流设置 → 触发器」中创建，即可获得 Webhook URL。
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        鉴权模式与 IP 白名单在「工作流设置 → 触发器」中编辑。
      </p>
    </div>
  )
})

/* ── 已部署 Webhook 凭证展示 ────────────────────────────── */

interface DeployedWebhookInfoProps {
  token: string
  secret: string | null
  authMode: AuthMode
  ipWhitelist: readonly string[]
  isEnabled: boolean
}

function DeployedWebhookInfo({
  token,
  secret,
  authMode,
  ipWhitelist,
  isEnabled,
}: DeployedWebhookInfoProps) {
  const webhookUrl = buildWebhookUrl(token)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const handleCopy = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // 静默失败
    }
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">Webhook 入口</span>
        <span
          className={
            isEnabled
              ? 'rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success'
              : 'rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground'
          }
        >
          {isEnabled ? '已启用' : '已禁用'}
        </span>
      </div>

      {/* Webhook URL */}
      <CredentialRow
        icon={<LinkIcon className="h-3 w-3" />}
        label="URL"
        value={webhookUrl}
        copied={copiedField === 'url'}
        onCopy={() => void handleCopy(webhookUrl, 'url')}
      />

      <dl className="space-y-1 text-[10px]">
        <div>
          <dt className="font-medium text-muted-foreground">鉴权模式</dt>
          <dd className="text-foreground/80">{AUTH_MODE_LABELS[authMode]}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">IP 白名单</dt>
          <dd className="font-mono text-foreground/80" data-testid="webhook-ip-allowlist">
            {ipWhitelist.length > 0 ? ipWhitelist.join(', ') : '不限制'}
          </dd>
        </div>
      </dl>

      {/* Signed 模式下展示 Secret */}
      {authMode === 'signed' && secret ? (
        <>
          <CredentialRow
            icon={<KeyRound className="h-3 w-3" />}
            label="密钥"
            value={secret}
            masked
            copied={copiedField === 'secret'}
            onCopy={() => void handleCopy(secret, 'secret')}
          />
          <p className="text-[10px] leading-4 text-muted-foreground">
            签名算法: HMAC-SHA256(secret, &quot;{'{timestamp}.{body}'}&quot;)
          </p>
        </>
      ) : null}
    </div>
  )
}

/* ── 凭证行组件 ─────────────────────────────────────────── */

interface CredentialRowProps {
  icon: React.ReactNode
  label: string
  value: string
  masked?: boolean
  copied: boolean
  onCopy: () => void
}

function CredentialRow({ icon, label, value, masked, copied, onCopy }: CredentialRowProps) {
  const [revealed, setRevealed] = useState(false)
  const displayValue = masked && !revealed ? '•'.repeat(20) : value

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          {icon}
          {label}
        </span>
        <div className="flex items-center gap-1">
          {masked ? (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {revealed ? '隐藏' : '显示'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Copy className="h-2.5 w-2.5" />
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>
      <code className="block truncate rounded border border-border/60 bg-surface-elevated px-2 py-1 text-[10px] text-foreground/80">
        {displayValue}
      </code>
    </div>
  )
}
