import { useQuery } from '@tanstack/react-query'

import { fetchTenantKeyById, fetchTenantKeys } from './tenantKeyApi'
import { tenantKeyKeys } from './tenantKeyKeys'

const TENANT_KEY_STALE_TIME = 5 * 60 * 1000
const TENANT_KEY_GC_TIME = TENANT_KEY_STALE_TIME

export function useTenantKeys() {
  return useQuery({
    queryKey: tenantKeyKeys.lists(),
    queryFn: fetchTenantKeys,
    staleTime: TENANT_KEY_STALE_TIME,
    gcTime: TENANT_KEY_GC_TIME,
  })
}

export function useTenantKeyDetail(
  keyId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: tenantKeyKeys.detail(keyId),
    queryFn: () => fetchTenantKeyById(keyId),
    staleTime: TENANT_KEY_STALE_TIME,
    gcTime: TENANT_KEY_GC_TIME,
    enabled: options?.enabled ?? Boolean(keyId),
  })
}
