export const interventionPolicyKeys = {
  all: ['intervention-policies'] as const,
  lists: () => [...interventionPolicyKeys.all, 'list'] as const,
  list: (workflowId: string) => [...interventionPolicyKeys.lists(), workflowId] as const,
  details: () => [...interventionPolicyKeys.all, 'detail'] as const,
  detail: (workflowId: string, policyId: string) =>
    [...interventionPolicyKeys.details(), workflowId, policyId] as const,
  resolved: () => [...interventionPolicyKeys.all, 'resolved'] as const,
  resolve: (workflowId: string, nodeId?: string | null) =>
    [...interventionPolicyKeys.resolved(), workflowId, nodeId ?? 'workflow'] as const,
}
