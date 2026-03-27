# Hook Guidelines

> How hooks are used in agentloom-studio.

---

## Overview

Data fetching uses a structured 4-file API layer per feature: raw API functions (ky), query key factory, useQuery hooks, and useMutation hooks. This pattern ensures consistent caching, invalidation, and type safety across all features.

---

## Data Fetching Architecture

Each feature follows a 4-file API layer:

| File | Responsibility |
|------|---------------|
| `{feature}Api.ts` | Raw HTTP functions using `apiClient` (ky) |
| `{feature}Keys.ts` | Query key factory object |
| `{feature}Queries.ts` | `useQuery` hooks |
| `{feature}Mutations.ts` | `useMutation` hooks |

---

## Query Key Factory Pattern

Every feature defines a hierarchical key factory using `as const` tuples:

```ts
// src/features/agent/api/agentKeys.ts
export const agentKeys = {
  all: ['agents'] as const,
  lists: () => [...agentKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...agentKeys.lists(), filters] as const,
  details: () => [...agentKeys.all, 'detail'] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,
}
```

This pattern is used identically across all features: `agentKeys`, `evidenceKeys`, `executionKeys`, `blockKeys`, `mcpToolKeys`, `auditLogKeys`, etc.

**Never define query keys as loose strings** -- always use the factory.

---

## Query Hooks

```ts
// src/features/agent/api/agentQueries.ts
export function useAgentList(params: ListAgentsParams = {}) {
  return useQuery({
    queryKey: agentKeys.list(params as Record<string, unknown>),
    queryFn: () => listAgents(params),
    placeholderData: keepPreviousData,
  })
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => getAgent(id),
    enabled: !!id,
  })
}
```

Conventions:
- Hook name matches the data: `useAgent`, `useAgentList`, `useEvidenceDetail`
- `enabled: !!id` guards against empty/undefined params
- `placeholderData: keepPreviousData` for paginated lists
- Return the `useQuery` result directly (no wrapper object)

---

## Mutation Hooks

```ts
// src/features/agent/api/agentMutations.ts
export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['agent', 'create'],
    mutationFn: (payload: CreateAgentPayload) => createAgent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
    },
    gcTime: 0,
  })
}

export function useUpdateAgent(agentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['agent', 'update', agentId],
    mutationFn: (payload: UpdateAgentPayload) => updateAgent(agentId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(agentKeys.detail(agentId), data)   // optimistic update
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
    },
    gcTime: 0,
  })
}
```

Conventions:
- **`gcTime: 0`** on all mutations (garbage collect immediately)
- `onSuccess` invalidates related query keys using the key factory
- Update mutations do `setQueryData` for instant UI + `invalidateQueries` for list staleness
- `mutationKey` includes entity + operation type

---

## Raw API Functions (ky)

```ts
// src/features/agent/api/agentDefinitionApi.ts
export async function createAgent(payload: CreateAgentPayload) {
  const response = await apiClient
    .post('agent-definitions', { json: toSnakeBody(payload) })
    .json<ApiResponse<AgentDefinition>>()
  return response.data
}
```

- `toSnakeBody()` converts camelCase payload to snake_case
- The `apiClient` afterResponse hook auto-converts snake_case responses back to camelCase
- **Never put snake/camel conversion in individual API functions** -- the centralized client handles it

---

## WebSocket Hook Pattern

```ts
// src/features/execution/hooks/useExecutionSocket.ts
export function useExecutionSocket(options: UseExecutionSocketOptions) {
  const callbacksRef = useRef<ExecutionSocketCallbacks>(options)
  callbacksRef.current = options  // always-fresh callbacks without re-connecting

  useEffect(() => {
    if (!executionId || !tenantId) return
    const socket = io(socketUrl, { ... })
    // register handlers reading callbacksRef.current
    return () => { socket.disconnect() }
  }, [authToken, executionId, socketUrl, tenantId, trackEventId])

  return { connectionStatus, lastEventId, error }
}
```

Key pattern: callbacks stored in a `useRef` to avoid socket reconnection on callback changes.

---

## Naming Conventions

| Pattern | Naming | Example |
|---------|--------|---------|
| Query hook | `use{Entity}` or `use{Entity}List` | `useAgent`, `useAgentList` |
| Mutation hook | `use{Action}{Entity}` | `useCreateAgent`, `useUpdateAgent` |
| Key factory | `{entity}Keys` | `agentKeys`, `executionKeys` |
| Raw API function | verb + entity | `createAgent`, `listAgents` |
| WebSocket hook | `use{Feature}Socket` | `useExecutionSocket` |

---

## Forbidden Patterns

1. **Loose string query keys** -- always use the key factory pattern
2. **Inline API calls in components** -- extract to `{feature}Api.ts`
3. **Manual snake/camel conversion in API functions** -- use `toSnakeBody()` and let the client handle responses
4. **Skipping `gcTime: 0` on mutations** -- always set to avoid stale mutation cache

---

## Examples

- Complete API layer: `src/features/agent/api/`
- WebSocket hook: `src/features/execution/hooks/useExecutionSocket.ts`
- Query key factory: `src/features/agent/api/agentKeys.ts`
