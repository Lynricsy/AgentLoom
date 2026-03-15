import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { UploadPublicKeyPayload } from '../types'
import {
  revokeTenantKey,
  rotateTenantKey,
  uploadPublicKey,
} from './tenantKeyApi'
import { tenantKeyKeys } from './tenantKeyKeys'

export function useUploadPublicKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...tenantKeyKeys.all, 'upload'],
    mutationFn: uploadPublicKey,
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tenantKeyKeys.all })
    },
  })
}

export function useRotateTenantKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...tenantKeyKeys.all, 'rotate'],
    mutationFn: ({
      keyId,
      payload,
    }: {
      keyId: string
      payload: UploadPublicKeyPayload
    }) => rotateTenantKey(keyId, payload),
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tenantKeyKeys.all })
    },
  })
}

export function useRevokeTenantKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...tenantKeyKeys.all, 'revoke'],
    mutationFn: revokeTenantKey,
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tenantKeyKeys.all })
    },
  })
}
