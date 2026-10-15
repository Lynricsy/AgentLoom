import type {
  TeamMessageListResponseDto,
  TeamMessageListResponseDtoDataInner,
  TeamRunDetailResponseDto,
  TeamRunDetailResponseDtoData,
  TeamRunListResponseDto,
  TeamRunListResponseDtoDataInner,
} from '@agentloom/api-client'
import { apiClient } from '@/shared/api/client'

/** 团队消息单页条数（server 上限 200）；超出部分按页追加加载 */
export const TEAM_MESSAGE_PAGE_SIZE = 200

/** GET /team-runs?executionId= 列表项 */
export type TeamRunSummary = TeamRunListResponseDtoDataInner

/** GET /team-runs/:teamRunId；result 为 lead 提交的 summary / artifact / knownLimitations，未完成时为 null */
export type TeamRunDetail = TeamRunDetailResponseDtoData

/** 团队消息列表项；content 为完整正文，fromRole 为 null 表示系统消息 */
export type TeamMessageItem = TeamMessageListResponseDtoDataInner

export type TeamMessagePage = TeamMessageListResponseDto

export const teamRunKeys = {
  all: ['team-runs'] as const,
  lists: () => [...teamRunKeys.all, 'list'] as const,
  list: (executionId: string) => [...teamRunKeys.lists(), executionId] as const,
  details: () => [...teamRunKeys.all, 'detail'] as const,
  detail: (teamRunId: string) => [...teamRunKeys.details(), teamRunId] as const,
  messages: (teamRunId: string) =>
    [...teamRunKeys.detail(teamRunId), 'messages'] as const,
}

/** GET /team-runs?executionId= —— 服务端按 createdAt 倒序，含重跑留下的历史运行 */
export async function listTeamRuns(executionId: string): Promise<TeamRunSummary[]> {
  const response = await apiClient
    .get('team-runs', { searchParams: { executionId } })
    .json<TeamRunListResponseDto>()
  return response.data
}

/** GET /team-runs/:teamRunId */
export async function getTeamRun(teamRunId: string): Promise<TeamRunDetail> {
  const response = await apiClient
    .get(`team-runs/${teamRunId}`)
    .json<TeamRunDetailResponseDto>()
  return response.data
}

/** GET /team-runs/:teamRunId/messages —— 按 createdAt 升序分页 */
export async function listTeamMessages(
  teamRunId: string,
  page = 1,
): Promise<TeamMessagePage> {
  return apiClient
    .get(`team-runs/${teamRunId}/messages`, {
      searchParams: { page, limit: TEAM_MESSAGE_PAGE_SIZE },
    })
    .json<TeamMessagePage>()
}
