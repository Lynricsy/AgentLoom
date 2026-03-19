export const privateDeploymentKeys = {
  all: ['private-deployment'] as const,
  details: () => [...privateDeploymentKeys.all, 'detail'] as const,
  detail: (organizationId: string) => [...privateDeploymentKeys.details(), organizationId] as const,
}
