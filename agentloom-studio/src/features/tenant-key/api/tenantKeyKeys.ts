export const tenantKeyKeys = {
  all: ['tenant-keys'] as const,
  lists: () => [...tenantKeyKeys.all, 'list'] as const,
  details: () => [...tenantKeyKeys.all, 'detail'] as const,
  detail: (id: string) => [...tenantKeyKeys.details(), id] as const,
}
