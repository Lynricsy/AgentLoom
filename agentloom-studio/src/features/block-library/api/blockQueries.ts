import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBlock,
  deleteBlock,
  fetchBlockById,
  fetchBlocks,
  updateBlock,
  type CreateBlockData,
  type ListBlocksParams,
  type UpdateBlockData,
} from './blockApi';
import { blockKeys } from './blockKeys';

const BLOCK_STALE_TIME = 5 * 60 * 1000;
const BLOCK_GC_TIME = BLOCK_STALE_TIME;

export function useBlocks(params: ListBlocksParams = {}) {
  return useQuery({
    queryKey: blockKeys.list(params),
    queryFn: () => fetchBlocks(params),
    staleTime: BLOCK_STALE_TIME,
    gcTime: BLOCK_GC_TIME,
  });
}

export function useBlockById(id: string | undefined) {
  return useQuery({
    queryKey: blockKeys.detail(id!),
    queryFn: () => fetchBlockById(id!),
    enabled: !!id,
    staleTime: BLOCK_STALE_TIME,
    gcTime: BLOCK_GC_TIME,
  });
}

export function useCreateBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...blockKeys.all, 'create'],
    mutationFn: (data: CreateBlockData) => createBlock(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: blockKeys.all });
    },
    gcTime: 0,
  });
}

export function useUpdateBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...blockKeys.all, 'update'],
    mutationFn: ({ id, data }: { id: string; data: UpdateBlockData }) =>
      updateBlock(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: blockKeys.all });
    },
    gcTime: 0,
  });
}

export function useDeleteBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...blockKeys.all, 'delete'],
    mutationFn: (id: string) => deleteBlock(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: blockKeys.all });
    },
    gcTime: 0,
  });
}
