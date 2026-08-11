export const platformApiTokenKeys = {
  all: ['platform-api-tokens'] as const,
  lists: () => [...platformApiTokenKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...platformApiTokenKeys.lists(), filters] as const,
}
