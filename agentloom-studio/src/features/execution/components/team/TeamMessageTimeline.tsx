import { memo, useState } from 'react'
import { ArrowRight, MessagesSquare } from 'lucide-react'
import { JevShadowBadge } from '@/features/decision-record'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { formatTime } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { StatusBadge } from '@/shared/ui/status-badge'
import {
  TEAM_MESSAGE_DELIVERY_META,
  TEAM_MESSAGE_KIND_LABEL,
} from '../../lib/teamPresentation'
import type { TeamMessageView } from '../../lib/teamRunView'

/** 超过该字数的正文默认折叠 */
const COLLAPSE_CONTENT_OVER = 600

const TeamMessageItem = memo(function TeamMessageItem({
  message,
}: {
  message: TeamMessageView
}) {
  const [expanded, setExpanded] = useState(false)
  const delivery = TEAM_MESSAGE_DELIVERY_META[message.deliveryStatus]
  const collapsible = message.content.length > COLLAPSE_CONTENT_OVER
  // 只有广播 observation 经过相关性决策；REST 已返回 decisionRecordId 时以它为准，
  // 仅有 socket 预览的 observation 先按消息 id 查询，避免为每条消息都发请求
  const mayHaveDecision =
    message.decisionRecordId !== null ||
    (message.isPreview && message.kind === 'observation')

  return (
    <li
      className="space-y-2 rounded-lg border border-border bg-muted p-3"
      data-testid={`team-message-${message.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-medium text-foreground">
          {message.fromRole ?? '系统'}
        </span>
        <ArrowRight className="size-3.5 text-muted-foreground" aria-label="发送给" />
        <span className="font-medium text-foreground">{message.toRole}</span>
        <Badge variant="outline" size="sm">
          {TEAM_MESSAGE_KIND_LABEL[message.kind]}
        </Badge>
        <StatusBadge
          tone={delivery.tone}
          size="sm"
          data-testid={`team-message-delivery-${message.id}`}
        >
          {delivery.label}
        </StatusBadge>
        {mayHaveDecision ? (
          <JevShadowBadge subjectType="team_message" subjectId={message.id} />
        ) : null}
        <span className="ml-auto tabular-nums text-muted-foreground">
          {formatTime(message.createdAt)}
        </span>
      </div>

      <p
        className={
          collapsible && !expanded
            ? 'line-clamp-6 whitespace-pre-wrap break-words text-sm text-foreground'
            : 'whitespace-pre-wrap break-words text-sm text-foreground'
        }
      >
        {message.content}
      </p>
      {message.isPreview ? (
        <p className="text-2xs text-muted-foreground">预览，完整正文在团队结束后载入</p>
      ) : null}
      {collapsible ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '收起' : '展开全文'}
        </Button>
      ) : null}

      {message.refs.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="引用">
          {message.refs.map((ref) => (
            <li key={ref}>
              <Badge variant="secondary" size="sm" className="font-mono">
                {ref}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
})

interface TeamMessageTimelineProps {
  messages: TeamMessageView[]
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}

/** 团队消息时间线：按创建时间升序，同一条消息的投递状态随 socket 原位推进 */
export const TeamMessageTimeline = memo(function TeamMessageTimeline({
  messages,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: TeamMessageTimelineProps) {
  if (messages.length === 0) {
    return (
      <EmptyState
        variant="plain"
        icon={MessagesSquare}
        title="暂无团队消息"
        description="成员调用 team_send_message 后，消息会实时出现在这里。"
      />
    )
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2" data-testid="team-message-timeline">
        {messages.map((message) => (
          <TeamMessageItem key={message.id} message={message} />
        ))}
      </ol>
      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoadingMore}
          onClick={onLoadMore}
        >
          {isLoadingMore ? '加载中…' : '加载更多消息'}
        </Button>
      ) : null}
    </div>
  )
})
