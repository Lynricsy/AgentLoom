export const shareKeys = {
  all: ['shares'] as const,
  lists: () => [...shareKeys.all, 'list'] as const,
  list: (resourceType: string, resourceId: string) =>
    [...shareKeys.lists(), resourceType, resourceId] as const,
  public: (token: string) => [...shareKeys.all, 'public', token] as const,
  imports: () => [...shareKeys.all, 'import'] as const,
  import: (token: string) => [...shareKeys.imports(), token] as const,
};
