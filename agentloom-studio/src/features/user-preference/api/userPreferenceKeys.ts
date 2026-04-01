export const userPreferenceKeys = {
  all: ['user-preferences'] as const,
  detail: () => [...userPreferenceKeys.all, 'detail'] as const,
}
