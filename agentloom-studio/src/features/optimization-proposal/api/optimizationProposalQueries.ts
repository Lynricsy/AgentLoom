import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { versionKeys, workflowKeys } from '@/features/workflow'
import {
  analyzeWorkflow,
  dismissProposal,
  fetchProposal,
  fetchProposals,
  publishProposal,
  rollbackProposal,
  startEvaluation,
  type ProposalDetail,
  type ProposalListFilters,
} from './optimizationProposalApi'
import { optimizationProposalKeys } from './optimizationProposalKeys'

/** 评测进行中时轮询详情的间隔 */
const EVALUATING_POLL_MS = 5000

export function useProposalList(filters: ProposalListFilters) {
  return useQuery({
    queryKey: optimizationProposalKeys.list(filters),
    queryFn: () => fetchProposals(filters),
    placeholderData: keepPreviousData,
  })
}

export function useProposalDetail(id: string | null) {
  return useQuery({
    queryKey: optimizationProposalKeys.detail(id ?? '__none__'),
    queryFn: () => fetchProposal(id as string),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.data?.status === 'evaluating' ? EVALUATING_POLL_MS : false,
  })
}

function invalidateProposals(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: optimizationProposalKeys.all })
}

/** 发布 / 回滚会切换工作流发布版本并改写草稿：同时刷新工作流详情与版本列表 */
function invalidateWorkflow(queryClient: QueryClient, proposal: ProposalDetail) {
  const workflowId = proposal.workflowDefinitionId
  return Promise.all([
    invalidateProposals(queryClient),
    queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflowId) }),
    queryClient.invalidateQueries({ queryKey: versionKeys.lists(workflowId) }),
    queryClient.invalidateQueries({ queryKey: versionKeys.published(workflowId) }),
  ])
}

export function useAnalyzeWorkflow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workflowDefinitionId: string) =>
      analyzeWorkflow(workflowDefinitionId),
    onSuccess: () => invalidateProposals(queryClient),
  })
}

export function useStartEvaluation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, caseCount }: { id: string; caseCount?: number }) =>
      startEvaluation(id, { caseCount }),
    onSuccess: () => invalidateProposals(queryClient),
  })
}

export function usePublishProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      label,
      releaseNotes,
    }: {
      id: string
      label?: string
      releaseNotes?: string
    }) => publishProposal(id, { label, releaseNotes }),
    onSuccess: (proposal) => invalidateWorkflow(queryClient, proposal),
  })
}

export function useRollbackProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rollbackProposal(id),
    onSuccess: (proposal) => invalidateWorkflow(queryClient, proposal),
  })
}

export function useDismissProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dismissProposal(id),
    onSuccess: () => invalidateProposals(queryClient),
  })
}
