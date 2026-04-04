import { useQuery } from '@tanstack/react-query';
import { shareKeys } from './shareKeys';
import { getPublicShare, listShares } from './shareApi';
import type {
  ListSharesParams,
  PublicShareData,
  ShareListResponse,
} from '../types';

export function useShareList(params: ListSharesParams) {
  return useQuery<ShareListResponse>({
    queryKey: shareKeys.list(params.resourceType, params.resourceId),
    queryFn: () => listShares(params),
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
