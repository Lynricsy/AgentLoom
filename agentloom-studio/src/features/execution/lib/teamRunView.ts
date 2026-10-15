import type {
  TeamFailureReason,
  TeamMemberStatus,
  TeamMessageDeliveryStatus,
  TeamMessageKind,
  TeamRunStatus,
} from '@agentloom/contracts'
import type { TeamMessageItem, TeamRunDetail } from '../api/teamRuns'
import type {
  TeamRunHydrateSnapshot,
  TeamRunLiveState,
} from '../stores/executionStore'
import type { TeamMessagePayload, TeamStatusPayload } from '../types'

/** socket 消息载荷的 preview 上限（契约 `TeamMessagePayloadSchema.preview.max(200)`） */
const TEAM_MESSAGE_PREVIEW_MAX = 200

export interface TeamMemberView {
  memberId: string
  role: string
  isLead: boolean
  status: TeamMemberStatus
  usedTokens: number
  /** 以下字段只有 REST 详情提供；成员只出现在 socket 状态里时缺省（回合数在补拉前可能滞后） */
  agentName: string | null
  turnCount: number | null
}

export interface TeamMessageView {
  id: string
  fromRole: string | null
  toRole: string
  kind: TeamMessageKind
  /** REST 有完整正文时取正文，否则为 socket 预览 */
  content: string
  /** 正文尚未经 REST 取得，仅为 ≤200 字的预览 */
  isPreview: boolean
  refs: string[]
  deliveryStatus: TeamMessageDeliveryStatus
  decisionRecordId: string | null
  createdAt: string
}

export interface TeamRunView {
  status: TeamRunStatus | null
  members: TeamMemberView[]
  budget: TeamStatusPayload['budget'] | null
  failureReason: TeamFailureReason | null
  messages: TeamMessageView[]
}

/** REST 详情 + 第一页消息 → store hydrate 快照（形状与 socket 载荷一致） */
export function toTeamRunHydrateSnapshot(
  detail: TeamRunDetail,
  messages: TeamMessageItem[],
): TeamRunHydrateSnapshot {
  return {
    stepId: detail.stepId,
    status: detail.status,
    members: detail.members.map((member) => ({
      memberId: member.id,
      role: member.role,
      isLead: member.isLead,
      status: member.status,
      usedTokens: member.usage.inputTokens + member.usage.outputTokens,
    })),
    // 拷贝一份：immer 会冻结写入 store 的对象，不能冻结 Query 缓存里的引用
    budget: { ...detail.budget },
    failureReason: detail.failureReason ?? undefined,
    messages: messages.map(
      (message): TeamMessagePayload => ({
        stepId: detail.stepId,
        teamRunId: detail.id,
        messageId: message.id,
        fromRole: message.fromRole,
        toRole: message.toRole,
        kind: message.kind,
        preview: message.content.slice(0, TEAM_MESSAGE_PREVIEW_MAX),
        deliveryStatus: message.deliveryStatus,
        createdAt: message.createdAt,
      }),
    ),
  }
}

/**
 * 合并 store 实时状态与 REST 数据。
 *
 * - 运行状态、成员状态与用量、预算、消息投递状态：store 有值时以 store 为准（socket 驱动），
 *   REST 只在 store 尚无对应数据时兜底，后续 refetch 不会回写这些字段。
 * - socket 不携带的字段（成员 Agent 名称、回合数、成本，消息正文、refs、decisionRecordId）
 *   只能来自 REST。
 */
export function buildTeamRunView(
  live: TeamRunLiveState | undefined,
  detail: TeamRunDetail | undefined,
  restMessages: TeamMessageItem[],
): TeamRunView {
  const restMembers = new Map(
    (detail?.members ?? []).map((member) => [member.id, member]),
  )

  const members: TeamMemberView[] =
    live && live.members.length > 0
      ? live.members.map((member) => {
          const rest = restMembers.get(member.memberId)
          return {
            memberId: member.memberId,
            role: member.role,
            isLead: member.isLead,
            status: member.status,
            usedTokens: member.usedTokens,
            agentName: rest?.agentName ?? null,
            turnCount: rest?.turnCount ?? null,
          }
        })
      : (detail?.members ?? []).map((member) => ({
          memberId: member.id,
          role: member.role,
          isLead: member.isLead,
          status: member.status,
          usedTokens: member.usage.inputTokens + member.usage.outputTokens,
          agentName: member.agentName,
          turnCount: member.turnCount,
        }))

  const messagesById = new Map<string, TeamMessageView>()
  for (const message of restMessages) {
    messagesById.set(message.id, { ...message, isPreview: false })
  }
  for (const message of live?.messages ?? []) {
    const rest = messagesById.get(message.messageId)
    messagesById.set(
      message.messageId,
      rest
        ? { ...rest, deliveryStatus: message.deliveryStatus }
        : {
            id: message.messageId,
            fromRole: message.fromRole,
            toRole: message.toRole,
            kind: message.kind,
            content: message.preview,
            isPreview: true,
            refs: [],
            deliveryStatus: message.deliveryStatus,
            decisionRecordId: null,
            createdAt: message.createdAt,
          },
    )
  }

  const messages = [...messagesById.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )

  return {
    status: live?.status ?? detail?.status ?? null,
    members,
    budget: live?.budget ?? detail?.budget ?? null,
    failureReason: live?.status
      ? (live.failureReason ?? null)
      : (detail?.failureReason ?? null),
    messages,
  }
}
