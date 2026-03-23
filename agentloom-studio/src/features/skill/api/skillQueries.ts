import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSkills,
  fetchSkillBySlug,
  enableSkill,
  disableSkill,
  type ListSkillsParams,
} from './skillApi';
import { skillKeys } from './skillKeys';

export function useSkills(params: ListSkillsParams = {}) {
  return useQuery({
    queryKey: skillKeys.list(params),
    queryFn: () => fetchSkills(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSkillBySlug(slug: string) {
  return useQuery({
    queryKey: skillKeys.detail(slug),
    queryFn: () => fetchSkillBySlug(slug),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEnableSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: enableSkill,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}

export function useDisableSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disableSkill,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}
