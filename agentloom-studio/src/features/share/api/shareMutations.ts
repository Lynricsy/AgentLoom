import { useMutation, useQueryClient } from '@tanstack/react-query';
import { shareKeys } from './shareKeys';
import { createShare, revokeShare } from './shareApi';
import type { CreateSharePayload, ShareRecord } from '../types';

export function useCreateShare() {
  const queryClient = useQueryClient();

  return useMutation<ShareRecord, Error, CreateSharePayload>({
    mutationFn: createShare,
    gcTime: 0,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: shareKeys.list(variables.workflowDefinitionId),
      });
    },
  });
}

export function useRevokeShare(workflowDefinitionId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: revokeShare,
    gcTime: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: shareKeys.list(workflowDefinitionId),
      });
    },
  });
}
