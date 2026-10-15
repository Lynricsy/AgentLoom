import type {
  TeamFailureReason,
  TeamMemberStatus,
  TeamMessageDeliveryStatus,
  TeamMessageKind,
  TeamRunStatus,
} from '@agentloom/contracts'
import type { StatusTone } from '@/shared/ui/status-badge'

interface StatusMeta {
  label: string
  tone: StatusTone
}

export const TEAM_RUN_STATUS_META: Record<TeamRunStatus, StatusMeta> = {
  running: { label: '协作中', tone: 'info' },
  completed: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
  cancelled: { label: '已取消', tone: 'warning' },
}

export const TEAM_MEMBER_STATUS_META: Record<TeamMemberStatus, StatusMeta> = {
  idle: { label: '空闲', tone: 'neutral' },
  running: { label: '执行中', tone: 'info' },
  ended: { label: '已结束', tone: 'neutral' },
  failed: { label: '失败', tone: 'error' },
}

export const TEAM_MESSAGE_DELIVERY_META: Record<
  TeamMessageDeliveryStatus,
  StatusMeta
> = {
  pending: { label: '待投递', tone: 'warning' },
  delivered: { label: '已投递', tone: 'info' },
  consumed: { label: '已读取', tone: 'success' },
  suppressed: { label: '已抑制', tone: 'neutral' },
  expired: { label: '已过期', tone: 'neutral' },
}

export const TEAM_MESSAGE_KIND_LABEL: Record<TeamMessageKind, string> = {
  observation: '发现',
  request: '请求',
  reply: '回复',
  artifact: '产物',
  system: '系统',
}

export const TEAM_FAILURE_REASON_LABEL: Record<TeamFailureReason, string> = {
  budget_exhausted: 'Token 或消息预算耗尽',
  deadline_exceeded: '超过截止时间',
  no_result: '负责人未提交结果',
  member_failed: '成员执行失败',
  schema_invalid: '产物多次不符合输出 Schema',
  cancelled: '已取消',
}

/** 距截止的剩余时间：`12:05` / `1:02:03`；已过截止返回 null */
export function formatTeamDeadlineRemaining(
  deadlineAt: string,
  now: number,
): string | null {
  const remainingMs = new Date(deadlineAt).getTime() - now
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return null
  }
  const totalSeconds = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`
}
