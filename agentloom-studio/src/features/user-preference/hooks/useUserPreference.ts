import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userPreferenceKeys } from '../api/userPreferenceKeys'
import {
  fetchUserPreference,
  updateUserPreference,
  type UpdateUserPreferenceInput,
} from '../api/userPreferenceApi'

export function useUserPreference() {
  return useQuery({
    queryKey: userPreferenceKeys.detail(),
    queryFn: fetchUserPreference,
  })
}

export function useUpdateUserPreference() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...userPreferenceKeys.all, 'update'] as const,
    mutationFn: (input: UpdateUserPreferenceInput) => updateUserPreference(input),
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userPreferenceKeys.detail() })
    },
  })
}
