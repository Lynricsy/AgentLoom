import { memo, useMemo } from 'react'
import cronstrue from 'cronstrue'
import {
  Clock3,
  History,
  Link as LinkIcon,
  PencilLine,
  Trash2,
  Zap,
} from 'lucide-react'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { StatusBadge } from '@/shared/ui/status-badge'
import { Switch } from '@/shared/ui/switch'
import { TRIGGER_TYPE_META } from '../lib/triggerMeta'
import {
  isApiEventConfig,
  isCronConfig,
  isWebhookConfig,
  type Trigger,
  type WebhookAuthMode,
} from '../types'
import { buildWebhookUrl } from './WebhookSecretDisplay'

const webhookAuthModeLabels: Record<WebhookAuthMode, string> = {
  simple: 'Simple（仅校验 Token 与 IP 白名单）',
  signed: 'Signed（HMAC-SHA256 签名 + 时间戳校验）',
  github: 'GitHub（X-Hub-Signature-256 签名，按投递去重）',
}

interface TriggerCardProps {
  trigger: Trigger
  onEdit: (trigger: Trigger) => void
  onDelete: (trigger: Trigger) => void
  onToggle: (trigger: Trigger) => void
  onViewHistory: (trigger: Trigger) => void
}

function getCronDescription(trigger: Trigger): string | null {
  if (trigger.type !== 'cron' || !isCronConfig(trigger.config)) {
    return null
  }

  try {
    return `${cronstrue.toString(trigger.config.expression)} · ${trigger.config.timezone}`
  } catch {
    return `${trigger.config.expression} · ${trigger.config.timezone}`
  }
}

export const TriggerCard = memo(function TriggerCard({
  trigger,
  onEdit,
  onDelete,
  onToggle,
  onViewHistory,
}: TriggerCardProps) {
  const cronDescription = useMemo(() => getCronDescription(trigger), [trigger])
  const webhookUrl = useMemo(() => {
    if (trigger.type !== 'webhook' || !isWebhookConfig(trigger.config)) {
      return null
    }

    return buildWebhookUrl(trigger.config.token)
  }, [trigger])
  const webhookAuthModeLabel = useMemo(() => {
    if (trigger.type !== 'webhook' || !isWebhookConfig(trigger.config)) {
      return null
    }

    // 历史触发器缺省 authMode 时服务端按 signed 处理，卡片展示口径保持一致
    return webhookAuthModeLabels[trigger.config.authMode ?? 'signed']
  }, [trigger])

  const typeMeta = TRIGGER_TYPE_META[trigger.type]

  return (
    <Card className={cn('p-4', typeMeta.cardClassName)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            {/* 停用态只淡化内容，开关区保持满色便于辨认当前状态 */}
            <div
              className={cn(
                'min-w-0 flex-1 space-y-1.5 transition-opacity duration-150',
                !trigger.isEnabled && 'opacity-70',
              )}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="min-w-0 break-words text-base font-semibold text-foreground">
                  {trigger.name}
                </h3>
                <StatusBadge tone={typeMeta.tone} size="sm" className="shrink-0">
                  {typeMeta.label}
                </StatusBadge>
              </div>
              <p className="break-words text-sm text-muted-foreground">
                {trigger.description?.trim() || '未填写描述'}
              </p>
            </div>

            <div className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {trigger.isEnabled ? '已启用' : '已停用'}
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    切换后立即生效
                  </p>
                </div>
                <Switch
                  aria-label="启用触发器"
                  checked={trigger.isEnabled}
                  onCheckedChange={() => onToggle(trigger)}
                />
              </div>
            </div>
          </div>

          <div
            className={cn(
              'space-y-4 transition-opacity duration-150',
              !trigger.isEnabled && 'opacity-70',
            )}
          >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InfoTile label="最近触发" value={formatDateTime(trigger.lastTriggeredAt)} icon={<Clock3 className="size-4" />} />
            <InfoTile label="下次执行" value={formatDateTime(trigger.nextFireAt)} icon={<Zap className="size-4" />} />
            <InfoTile label="触发次数" value={`${formatNumber(trigger.triggerCount)} 次`} icon={<History className="size-4" />} />
          </div>

          {cronDescription ? (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
              <p className="text-xs font-medium tracking-wide text-warning">执行计划</p>
              <p className="mt-2 break-words">{cronDescription}</p>
            </div>
          ) : null}

          {trigger.type === 'webhook' && webhookUrl ? (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
              <p className="text-xs font-medium tracking-wide text-info">Webhook 入口</p>
              <div className="mt-2 flex items-start gap-2 text-muted-foreground">
                <LinkIcon className="mt-0.5 size-4 shrink-0 text-info" />
                <code className="break-all text-xs text-foreground">{webhookUrl}</code>
              </div>
              {webhookAuthModeLabel ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  验证模式：
                  <code className="ml-1 break-words rounded-xs bg-surface px-1.5 py-0.5 text-foreground">
                    {webhookAuthModeLabel}
                  </code>
                </p>
              ) : null}
            </div>
          ) : null}

          {trigger.type === 'api_event' && isApiEventConfig(trigger.config) ? (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
              <p className="text-xs font-medium tracking-wide text-primary">事件契约</p>
              <div className="mt-2 grid gap-2 text-muted-foreground sm:grid-cols-2">
                <span className="min-w-0 break-all">事件源：{trigger.config.eventSource}</span>
                <span className="min-w-0 break-all">事件类型：{trigger.config.eventType}</span>
              </div>
              {trigger.config.filterExpression ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  过滤表达式：
                  <code className="ml-1 break-all rounded-xs bg-surface px-1.5 py-0.5 text-foreground">
                    {trigger.config.filterExpression}
                  </code>
                </p>
              ) : null}
              {trigger.config.secret ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  已配置签名密钥（服务端做 HMAC-SHA256 验签）
                </p>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 xl:flex-col xl:items-stretch">
          <Button
            variant="outline"
            size="sm"
            className="justify-center"
            onClick={() => onViewHistory(trigger)}
          >
            <History />
            历史记录
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-center"
            onClick={() => onEdit(trigger)}
          >
            <PencilLine />
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-center text-error hover:bg-error/10 hover:text-error"
            onClick={() => onDelete(trigger)}
          >
            <Trash2 />
            删除
          </Button>
        </div>
      </div>
    </Card>
  )
})

interface InfoTileProps {
  label: string
  value: string
  icon: React.ReactNode
}

function InfoTile({ label, value, icon }: InfoTileProps) {
  return (
    <div className="rounded-lg border border-border bg-muted p-3">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm text-foreground tabular-nums">{value}</p>
    </div>
  )
}
