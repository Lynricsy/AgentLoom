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

/**
 * 分页获取 Memory Instance 列表
 */
export function useMemoryInstances(params?: MemoryInstanceListParams) {
  return useQuery({
    queryKey: memoryInstanceKeys.list(params),
    queryFn: () => fetchMemoryInstances(params),
  });
}

/**
 * 获取全部 Memory Instance（不分页）
 */
export function useAllMemoryInstances(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: memoryInstanceKeys.allOptions(),
    queryFn: fetchAllMemoryInstances,
    enabled: options?.enabled,
  });
}

/**
 * 获取单个 Memory Instance 详情
 */
export function useMemoryInstance(id: string | null) {
  return useQuery({
    queryKey: memoryInstanceKeys.detail(id!),
    queryFn: () => fetchMemoryInstance(id!),
    enabled: !!id,
  });
}

/**
 * 创建 Memory Instance
 */
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

/**
 * 更新 Memory Instance
 */
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

/**
 * 删除 Memory Instance
 */
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
