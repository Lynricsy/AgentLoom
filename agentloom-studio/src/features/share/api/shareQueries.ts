import { useQuery } from '@tanstack/react-query';
import { shareKeys } from './shareKeys';
import { getPublicShare, listShares } from './shareApi';
import type { PublicShareData, ShareListResponse } from '../types';

export function useShareList(workflowDefinitionId: string) {
  return useQuery<ShareListResponse>({
    queryKey: shareKeys.list(workflowDefinitionId),
    queryFn: () => listShares(workflowDefinitionId),
    staleTime: 30_000,
  });
}

export function usePublicShare(token: string) {
  return useQuery<PublicShareData>({
    queryKey: shareKeys.public(token),
    queryFn: () => getPublicShare(token),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
