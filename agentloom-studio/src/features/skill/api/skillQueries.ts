import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSkills,
  fetchSkillById,
  createSkill,
  updateSkill,
  deleteSkill,
  archiveSkill,
  fetchSkillFiles,
  uploadSkillFile,
  deleteSkillFile,
  type ListSkillsParams,
  type CreateSkillPayload,
  type UpdateSkillPayload,
} from './skillApi';
import { skillKeys } from './skillKeys';

export function useSkillList(params?: ListSkillsParams) {
  return useQuery({
    queryKey: skillKeys.list(params),
    queryFn: () => fetchSkills(params),
  });
}

export const useSkills = useSkillList;

export function useSkill(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: skillKeys.detail(id),
    queryFn: () => fetchSkillById(id),
    enabled: options?.enabled ?? Boolean(id),
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSkillPayload) => createSkill(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateSkillPayload & { id: string }) =>
      updateSkill(id, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
      void queryClient.invalidateQueries({
        queryKey: skillKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

export function useArchiveSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveSkill(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
      void queryClient.invalidateQueries({
        queryKey: skillKeys.detail(id),
      });
    },
  });
}

export function useSkillFiles(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: skillKeys.files(id),
    queryFn: () => fetchSkillFiles(id),
    enabled: options?.enabled ?? Boolean(id),
  });
}

export function useUploadSkillFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      uploadSkillFile(id, file),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: skillKeys.files(variables.id),
      });
      void queryClient.invalidateQueries({
        queryKey: skillKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteSkillFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fileName }: { id: string; fileName: string }) =>
      deleteSkillFile(id, fileName),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: skillKeys.files(variables.id),
      });
      void queryClient.invalidateQueries({
        queryKey: skillKeys.detail(variables.id),
      });
    },
  });
}
