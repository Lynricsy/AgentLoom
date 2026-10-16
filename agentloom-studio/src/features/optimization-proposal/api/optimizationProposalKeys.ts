import type { ProposalListFilters } from './optimizationProposalApi'

export const optimizationProposalKeys = {
  all: ['optimization-proposals'] as const,
  lists: () => [...optimizationProposalKeys.all, 'list'] as const,
  list: (filters: ProposalListFilters) =>
    [...optimizationProposalKeys.lists(), filters] as const,
  details: () => [...optimizationProposalKeys.all, 'detail'] as const,
  detail: (id: string) => [...optimizationProposalKeys.details(), id] as const,
}
