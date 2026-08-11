export const organizationKeys = {
  all: ['organization'] as const,
  details: () => [...organizationKeys.all, 'detail'] as const,
  detail: (organizationId: string) =>
    [...organizationKeys.details(), organizationId] as const,
  memberLists: () => [...organizationKeys.all, 'members'] as const,
  members: (organizationId: string) =>
    [...organizationKeys.memberLists(), organizationId] as const,
}
