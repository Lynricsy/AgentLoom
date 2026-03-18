export const organizationAutonomyPolicyKeys = {
  all: ['organization-autonomy-policy'] as const,
  details: () => [...organizationAutonomyPolicyKeys.all, 'detail'] as const,
  detail: (organizationId: string) =>
    [...organizationAutonomyPolicyKeys.details(), organizationId] as const,
}
