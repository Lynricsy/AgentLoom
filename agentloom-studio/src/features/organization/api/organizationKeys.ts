export const organizationKeys = {
  all: ['organization'] as const,
  /** 当前租户所属组织，由服务端解析，前端无需拼 id */
  current: () => [...organizationKeys.all, 'current'] as const,
  memberLists: () => [...organizationKeys.all, 'members'] as const,
  members: (organizationId: string) =>
    [...organizationKeys.memberLists(), organizationId] as const,
}
