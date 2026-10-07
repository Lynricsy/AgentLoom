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
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { StatusBadge, type StatusTone } from '@/shared/ui/status-badge'
import { Switch } from '@/shared/ui/switch'
import {
  isApiEventConfig,
  isCronConfig,
  isWebhookConfig,
  type Trigger,
} from '../types'
import { buildWebhookUrl } from './WebhookSecretDisplay'

/** 触发器类型 → 语义语气：webhook=信息、定时=预警、API 事件=品牌 */
const TYPE_META: Record<
  Trigger['type'],
  { label: string; tone: StatusTone; cardClassName: string }
> = {
  cron: {
    label: '定时触发',
    tone: 'warning',
    cardClassName: 'border-warning/20 bg-warning/5',
  },
  webhook: {
    label: 'Webhook',
    tone: 'info',
    cardClassName: 'border-info/20 bg-info/5',
  },
  api_event: {
    label: 'API Event',
    tone: 'primary',
    cardClassName: 'border-primary/20 bg-primary/5',
  },
}

interface TriggerCardProps {
  trigger: Trigger
  onEdit: (trigger: Trigger) => void
  onDelete: (trigger: Trigger) => void
  onToggle: (trigger: Trigger) => void
  onViewHistory: (trigger: Trigger) => void
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
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
    return (trigger.config.authMode ?? 'signed') === 'signed'
      ? 'Signed（HMAC-SHA256 签名 + 时间戳校验）'
      : 'Simple（仅校验 Token 与 IP 白名单）'
  }, [trigger])

  const typeMeta = TYPE_META[trigger.type]

  return (
    <Card
      className={cn(
        'p-4',
        typeMeta.cardClassName,
        trigger.isEnabled ? 'hover:border-primary/40' : 'opacity-80 saturate-75',
      )}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">{trigger.name}</h3>
                <StatusBadge
                  tone={typeMeta.tone}
                  size="sm"
                  className="px-2.5 py-1 uppercase tracking-[0.18em]"
                >
                  {typeMeta.label}
                </StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                {trigger.description?.trim() || '未填写描述'}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface px-3 py-2">
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
                  checked={trigger.isEnabled}
                  onCheckedChange={() => onToggle(trigger)}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InfoTile label="最近触发" value={formatDateTime(trigger.lastTriggeredAt)} icon={<Clock3 className="size-4" />} />
            <InfoTile label="下次执行" value={formatDateTime(trigger.nextFireAt)} icon={<Zap className="size-4" />} />
            <InfoTile label="触发次数" value={`${trigger.triggerCount} 次`} icon={<History className="size-4" />} />
          </div>

          {cronDescription ? (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-warning">执行计划</p>
              <p className="mt-2">{cronDescription}</p>
            </div>
          ) : null}

          {trigger.type === 'webhook' && webhookUrl ? (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-info">Webhook 入口</p>
              <div className="mt-2 flex items-start gap-2 text-muted-foreground">
                <LinkIcon className="mt-0.5 size-4 shrink-0 text-info" />
                <code className="break-all text-xs text-foreground">{webhookUrl}</code>
              </div>
              {webhookAuthModeLabel ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  验证模式：
                  <code className="ml-1 rounded-xs bg-surface px-1.5 py-0.5 text-foreground">
                    {webhookAuthModeLabel}
                  </code>
                </p>
              ) : null}
            </div>
          ) : null}

          {trigger.type === 'api_event' && isApiEventConfig(trigger.config) ? (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">事件契约</p>
              <div className="mt-2 grid gap-2 text-muted-foreground sm:grid-cols-2">
                <span>事件源：{trigger.config.eventSource}</span>
                <span>事件类型：{trigger.config.eventType}</span>
              </div>
              {trigger.config.filterExpression ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  过滤表达式：
                  <code className="ml-1 rounded-xs bg-surface px-1.5 py-0.5 text-foreground">
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

        <div className="flex shrink-0 flex-wrap gap-2 xl:flex-col xl:items-stretch">
          <Button
            variant="outline"
            size="sm"
            className="justify-center gap-1.5"
            onClick={() => onViewHistory(trigger)}
          >
            <History />
            历史记录
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-center gap-1.5"
            onClick={() => onEdit(trigger)}
          >
            <PencilLine />
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-center gap-1.5 text-error hover:bg-error/10 hover:text-error"
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
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  )
}
