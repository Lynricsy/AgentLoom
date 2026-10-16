import type {
  AnalyzeResponseDto,
  ProposalDetailResponseDto,
  ProposalDetailResponseDtoData,
  ProposalDetailResponseDtoDataLatestEvaluation,
  ProposalDetailResponseDtoDataLatestEvaluationRunsInner,
  ProposalDetailResponseDtoDataLatestEvaluationSummaryBaseline,
  ProposalListResponseDto,
  ProposalListResponseDtoDataInner,
} from '@agentloom/api-client'
import { apiClient } from '@/shared/api/client'

/** 列表项（GET /optimization-proposals） */
export type ProposalSummary = ProposalListResponseDtoDataInner
/** 详情（含最近一次评测与发布报告） */
export type ProposalDetail = ProposalDetailResponseDtoData
export type ProposalEvaluation = ProposalDetailResponseDtoDataLatestEvaluation
export type ProposalEvaluationRun = ProposalDetailResponseDtoDataLatestEvaluationRunsInner
export type ProposalEvaluationArmSummary = ProposalDetailResponseDtoDataLatestEvaluationSummaryBaseline
export type ProposalStatus = ProposalSummary['status']
export type ProposalType = ProposalSummary['proposalType']
export type ProposalVerdict = NonNullable<ProposalSummary['verdict']>
export type ProposalListPage = ProposalListResponseDto

export const PROPOSAL_PAGE_SIZE = 20

export interface ProposalListFilters {
  workflowDefinitionId?: string
  status?: ProposalStatus
  page: number
  limit: number
}

/** GET /optimization-proposals —— 服务端按创建时间倒序分页 */
export async function fetchProposals(
  filters: ProposalListFilters,
): Promise<ProposalListPage> {
  const searchParams: Record<string, string | number> = {
    page: filters.page,
    limit: filters.limit,
  }
  if (filters.workflowDefinitionId) {
    searchParams.workflowDefinitionId = filters.workflowDefinitionId
  }
  if (filters.status) {
    searchParams.status = filters.status
  }
  return apiClient
    .get('optimization-proposals', { searchParams })
    .json<ProposalListPage>()
}

/** GET /optimization-proposals/:id */
export async function fetchProposal(id: string): Promise<ProposalDetail> {
  const response = await apiClient
    .get(`optimization-proposals/${id}`)
    .json<ProposalDetailResponseDto>()
  return response.data
}

/** POST /optimization-proposals/analyze —— 返回本次新建的提案（已有活跃提案的不会重复创建） */
export async function analyzeWorkflow(
  workflowDefinitionId: string,
): Promise<ProposalSummary[]> {
  const response = await apiClient
    .post('optimization-proposals/analyze', { json: { workflowDefinitionId } })
    .json<AnalyzeResponseDto>()
  return response.data
}

/** POST /optimization-proposals/:id/evaluate —— 202，评测在后台执行 */
export async function startEvaluation(
  id: string,
  body: { caseCount?: number },
): Promise<ProposalDetail> {
  const response = await apiClient
    .post(`optimization-proposals/${id}/evaluate`, { json: body })
    .json<ProposalDetailResponseDto>()
  return response.data
}

/** POST /optimization-proposals/:id/publish —— 仅评测结论为 improved 时可发布 */
export async function publishProposal(
  id: string,
  body: { label?: string; releaseNotes?: string },
): Promise<ProposalDetail> {
  const response = await apiClient
    .post(`optimization-proposals/${id}/publish`, { json: body })
    .json<ProposalDetailResponseDto>()
  return response.data
}

/** POST /optimization-proposals/:id/rollback —— 重新发布基线版本 */
export async function rollbackProposal(id: string): Promise<ProposalDetail> {
  const response = await apiClient
    .post(`optimization-proposals/${id}/rollback`, { json: {} })
    .json<ProposalDetailResponseDto>()
  return response.data
}

/** POST /optimization-proposals/:id/dismiss */
export async function dismissProposal(id: string): Promise<ProposalDetail> {
  const response = await apiClient
    .post(`optimization-proposals/${id}/dismiss`, { json: {} })
    .json<ProposalDetailResponseDto>()
  return response.data
}
