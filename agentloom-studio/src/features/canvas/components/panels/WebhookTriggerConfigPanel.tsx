import { memo, useCallback, useState, type ChangeEvent } from 'react'
import { Copy, KeyRound, Link as LinkIcon, Webhook } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useCanvasStore } from '../../stores/canvasStore'
import { useTriggers, isWebhookConfig, hasWebhookSecret } from '@/features/trigger'
import { buildWebhookUrl } from '@/features/trigger/components/WebhookSecretDisplay'

type AuthMode = 'simple' | 'signed'

interface WebhookTriggerConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

interface WebhookTriggerConfigLocal {
  authMode: AuthMode
  ipWhitelist: string
}

const AUTH_MODE_META: Record<AuthMode, { label: string; description: string }> = {
  simple: {
    label: '简单模式',
    description: '仅使用 URL Token 鉴权，适合简单集成',
  },
  signed: {
    label: '签名验证',
    description: '需要 HMAC-SHA256 签名，适合高安全场景',
  },
}

function parseWebhookTriggerConfig(config: Record<string, unknown>): WebhookTriggerConfigLocal {
  const authMode = config.authMode
  return {
    authMode:
      authMode === 'simple' || authMode === 'signed' ? authMode : 'simple',
    ipWhitelist: typeof config.ipWhitelist === 'string' ? config.ipWhitelist : '',
  }
}

export const WebhookTriggerConfigPanel = memo(function WebhookTriggerConfigPanel({
  config,
  onApply,
}: WebhookTriggerConfigPanelProps) {
  const parsed = parseWebhookTriggerConfig(config)
  const workflowId = useCanvasStore((s) => s.workflowId)

  const { data: triggersResult } = useTriggers(workflowId ?? '', { type: 'webhook' })
  const deployedTrigger = triggersResult?.data?.[0] ?? null
  const deployedWebhookConfig =
    deployedTrigger && isWebhookConfig(deployedTrigger.config)
      ? deployedTrigger.config
      : null
  const deployedAuthMode = deployedWebhookConfig?.authMode ?? 'signed'

  const applyPatch = useCallback(
    (patch: Partial<WebhookTriggerConfigLocal>) => {
      const next = { ...parseWebhookTriggerConfig(config), ...patch }
      onApply({ config: next })
    },
    [config, onApply],
  )

  const handleAuthModeChange = useCallback(
    (value: string) => {
      applyPatch({ authMode: value as AuthMode })
    },
    [applyPatch],
  )

  const handleIpWhitelistChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      applyPatch({ ipWhitelist: e.target.value })
    },
    [applyPatch],
  )

  const currentMeta = AUTH_MODE_META[parsed.authMode]

  return (
    <div className="space-y-4 px-4 py-4" data-testid="webhook-trigger-config-panel">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-warning" />
        <span className="text-xs font-medium text-foreground">Webhook 触发器</span>
      </div>

      {/* 已部署凭证 */}
      {deployedWebhookConfig && deployedTrigger ? (
        <DeployedWebhookInfo
          token={deployedWebhookConfig.token}
          secret={hasWebhookSecret(deployedTrigger.config) ? deployedTrigger.config.secret : null}
          authMode={deployedAuthMode}
          isEnabled={deployedTrigger.isEnabled}
        />
      ) : (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          工作流发布后将生成 Webhook URL
        </div>
      )}

      {/* 鉴权模式 */}
      <div>
        <label
          htmlFor="webhook-auth-mode"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          鉴权模式
        </label>
        <Select value={parsed.authMode} onValueChange={handleAuthModeChange}>
          <SelectTrigger id="webhook-auth-mode" aria-label="鉴权模式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="simple">{AUTH_MODE_META.simple.label}</SelectItem>
            <SelectItem value="signed">{AUTH_MODE_META.signed.label}</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          {currentMeta.description}
        </p>
      </div>

      {/* IP 白名单 */}
      <div>
        <label
          htmlFor="webhook-ip-whitelist"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          IP 白名单（可选）
        </label>
        <textarea
          id="webhook-ip-whitelist"
          value={parsed.ipWhitelist}
          onChange={handleIpWhitelistChange}
          rows={4}
          placeholder={'每行一个 IP 地址，例：\n192.168.1.0/24\n10.0.0.1'}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          留空表示允许所有来源，支持 CIDR 格式
        </p>
      </div>

      {/* 使用说明 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
        <p className="font-medium text-foreground">使用说明</p>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>外部系统通过 POST 请求发送 JSON 载荷触发工作流</li>
          <li>载荷数据将作为 payload 端口的输出传递给下游节点</li>
          {parsed.authMode === 'signed' && (
            <li>调用方需使用 Secret 计算 HMAC-SHA256 签名</li>
          )}
        </ul>
      </div>
    </div>
  )
})

/* ── 已部署 Webhook 凭证展示 ────────────────────────────── */

interface DeployedWebhookInfoProps {
  token: string
  secret: string | null
  authMode: AuthMode
  isEnabled: boolean
}

function DeployedWebhookInfo({ token, secret, authMode, isEnabled }: DeployedWebhookInfoProps) {
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
