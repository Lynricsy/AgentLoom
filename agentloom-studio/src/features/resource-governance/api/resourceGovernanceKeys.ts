export const resourceGovernanceKeys = {
  all: ['resource-governance'] as const,
  details: () => [...resourceGovernanceKeys.all, 'detail'] as const,
  detail: (organizationId: string) =>
    [...resourceGovernanceKeys.details(), organizationId] as const,
}
