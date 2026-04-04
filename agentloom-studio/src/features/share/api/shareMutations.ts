import { useMutation, useQueryClient } from '@tanstack/react-query'
import { shareKeys } from './shareKeys'
import { createShare, importAgentShare, revokeShare } from './shareApi'
import type {
  CreateSharePayload,
  ImportAgentShareResponse,
  ShareRecord,
  ShareResourceType,
} from '../types'

export function useCreateShare() {
  const queryClient = useQueryClient()

  return useMutation<ShareRecord, Error, CreateSharePayload>({
    mutationFn: createShare,
    gcTime: 0,
    onSuccess: (_data, variables) => {
      const resourceType: ShareResourceType =
        'agentDefinitionId' in variables ? 'agent' : 'workflow'
      const resourceId =
        'agentDefinitionId' in variables
          ? variables.agentDefinitionId
          : variables.workflowDefinitionId

      queryClient.invalidateQueries({
        queryKey: shareKeys.list(resourceType, resourceId),
      })
    },
  })
}

export function useRevokeShare(
  resourceType: ShareResourceType,
  resourceId: string,
) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (shareId) => revokeShare(resourceType, shareId),
    gcTime: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: shareKeys.list(resourceType, resourceId),
      })
    },
  })
}

export function useImportAgentShare() {
  return useMutation<ImportAgentShareResponse, Error, string>({
    mutationKey: shareKeys.imports(),
    mutationFn: importAgentShare,
    gcTime: 0,
  })
}
