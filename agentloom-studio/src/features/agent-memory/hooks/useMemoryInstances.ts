import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMemoryInstance,
  deleteMemoryInstance,
  fetchAllMemoryInstances,
  fetchMemoryInstance,
  fetchMemoryInstances,
  updateMemoryInstance,
} from '../api/memoryApi';
import { memoryInstanceKeys } from '../api/memoryKeys';
import type {
  CreateMemoryInstanceInput,
  MemoryInstanceListParams,
  UpdateMemoryInstanceInput,
} from '../types';

export function useMemoryInstances(params?: MemoryInstanceListParams) {
  return useQuery({
    queryKey: memoryInstanceKeys.list(params),
    queryFn: () => fetchMemoryInstances(params),
  });
}

export function useAllMemoryInstances(options?: {
  enabled?: boolean;
  sourceKind?: MemoryInstanceListParams['sourceKind'];
}) {
  return useQuery({
    queryKey: memoryInstanceKeys.allOptions(options?.sourceKind),
    queryFn: () => fetchAllMemoryInstances({ sourceKind: options?.sourceKind }),
    enabled: options?.enabled,
  });
}

export function useMemoryInstance(id: string | null) {
  return useQuery({
    queryKey: memoryInstanceKeys.detail(id!),
    queryFn: () => fetchMemoryInstance(id!),
    enabled: !!id,
  });
}

export function useCreateMemoryInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['create-memory-instance'],
    mutationFn: (input: CreateMemoryInstanceInput) =>
      createMemoryInstance(input),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: memoryInstanceKeys.lists(),
      });
    },
  });
}

export function useUpdateMemoryInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['update-memory-instance'],
    mutationFn: ({ id, input }: { id: string; input: UpdateMemoryInstanceInput }) =>
      updateMemoryInstance(id, input),
    gcTime: 0,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: memoryInstanceKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: memoryInstanceKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteMemoryInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['delete-memory-instance'],
    mutationFn: (id: string) => deleteMemoryInstance(id),
    gcTime: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: memoryInstanceKeys.lists(),
      });
    },
  });
}
