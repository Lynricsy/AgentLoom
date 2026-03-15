export const shareKeys = {
  all: ['shares'] as const,
  lists: () => [...shareKeys.all, 'list'] as const,
  list: (workflowId: string) => [...shareKeys.lists(), workflowId] as const,
  public: (token: string) => [...shareKeys.all, 'public', token] as const,
};
