import { memo, useMemo } from 'react'
import { cva } from 'class-variance-authority'
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
import { Switch } from '@/shared/ui/switch'
import {
  isApiEventConfig,
  isCronConfig,
  isWebhookConfig,
  type Trigger,
} from '../types'
import { buildWebhookUrl } from './WebhookSecretDisplay'

const triggerCardVariants = cva(
  'rounded-2xl border p-4 shadow-sm transition-colors',
  {
    variants: {
      tone: {
        cron: 'border-sky-500/20 bg-sky-500/10',
        webhook: 'border-violet-500/20 bg-violet-500/10',
        api_event: 'border-amber-500/20 bg-amber-500/10',
      },
      enabled: {
        true: 'hover:border-primary/40',
        false: 'opacity-80 saturate-75',
      },
    },
  },
)

const typeBadgeClassNames: Record<Trigger['type'], string> = {
  cron: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
  webhook: 'border-violet-400/30 bg-violet-500/10 text-violet-200',
  api_event: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
}

const typeLabels: Record<Trigger['type'], string> = {
  cron: '定时触发',
  webhook: 'Webhook',
  api_event: 'API Event',
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

  return (
    <article
      className={triggerCardVariants({
        tone: trigger.type,
        enabled: trigger.isEnabled,
      })}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">{trigger.name}</h3>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
                    typeBadgeClassNames[trigger.type],
                  )}
                >
                  {typeLabels[trigger.type]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {trigger.description?.trim() || '未填写描述'}
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {trigger.isEnabled ? '已启用' : '已停用'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">切换后立即生效</p>
                </div>
                <Switch checked={trigger.isEnabled} onCheckedChange={() => onToggle(trigger)} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InfoTile label="最近触发" value={formatDateTime(trigger.lastTriggeredAt)} icon={<Clock3 className="h-4 w-4" />} />
            <InfoTile label="下次执行" value={formatDateTime(trigger.nextFireAt)} icon={<Zap className="h-4 w-4" />} />
            <InfoTile label="触发次数" value={`${trigger.triggerCount} 次`} icon={<History className="h-4 w-4" />} />
          </div>

          {cronDescription ? (
            <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm text-foreground">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-200">执行计划</p>
              <p className="mt-2">{cronDescription}</p>
            </div>
          ) : null}

          {trigger.type === 'webhook' && webhookUrl ? (
            <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm text-foreground">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">Webhook 入口</p>
              <div className="mt-2 flex items-start gap-2 text-muted-foreground">
                <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
                <code className="break-all text-xs text-foreground/90">{webhookUrl}</code>
              </div>
            </div>
          ) : null}

          {trigger.type === 'api_event' && isApiEventConfig(trigger.config) ? (
            <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm text-foreground">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-200">事件订阅</p>
              <div className="mt-2 grid gap-2 text-muted-foreground sm:grid-cols-2">
                <span>事件源：{trigger.config.eventSource}</span>
                <span>事件类型：{trigger.config.eventType}</span>
              </div>
              {trigger.config.filterExpression ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  过滤表达式：
                  <code className="ml-1 rounded bg-black/20 px-1.5 py-0.5 text-foreground/90">
                    {trigger.config.filterExpression}
                  </code>
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
            <History className="h-3.5 w-3.5" />
            历史记录
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-center gap-1.5"
            onClick={() => onEdit(trigger)}
          >
            <PencilLine className="h-3.5 w-3.5" />
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-center gap-1.5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
            onClick={() => onDelete(trigger)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      </div>
    </article>
  )
})

interface InfoTileProps {
  label: string
  value: string
  icon: React.ReactNode
}

function InfoTile({ label, value, icon }: InfoTileProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  )
}
