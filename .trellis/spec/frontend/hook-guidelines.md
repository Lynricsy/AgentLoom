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

- `toSnakeBody()` is opt-in and only for endpoints whose DTO/query contract explicitly accepts snake_case aliases
- The `apiClient` afterResponse hook auto-converts JSON responses back to camelCase
- Request bodies are **not** auto-converted by `apiClient`; verify the backend DTO before deciding whether to send camelCase as-is or wrap with `toSnakeBody()`

---

## Scenario: LLM Model + Knowledge Base Resource Forms

### 1. Scope / Trigger

- Trigger: touching `src/features/llm/api/llmModelApi.ts`, LLM model config dialogs/panels, or knowledge-base settings forms that bind an embedding model config.

### 2. Signatures

- `createLlmModel(config: CreateLlmModelInput): Promise<LlmModelInfo>`
- `updateLlmModel(id: string, config: UpdateLlmModelInput): Promise<LlmModelInfo>`
- `KnowledgeBaseDetailPage` settings form fields:
  - `chunkSize`
  - `chunkOverlap`
  - `embeddingModelConfigId`
- `LlmModelInfo` contract fields used by the UI:
  - `modelType: 'chat' | 'embedding'`
  - `embeddingDimensions?: number | null`

### 3. Contracts

- `llmModelApi.ts` must send LLM model payloads in camelCase because the backend DTO contract uses camelCase fields such as `modelType` and `embeddingDimensions`.
- Knowledge base settings must send `embeddingModelConfigId` in camelCase so the backend can persist `knowledge_bases.embedding_model_config_id`.
- The knowledge-base embedding selector must only offer models where `modelType === 'embedding'`.
- LLM model management cards/dialogs must surface both the usage (`Chat` or `Embedding`) and the configured embedding dimension when present.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Verification Point |
|-----------|-------------------|--------------------|
| LLM create/update payload uses camelCase `modelType` / `embeddingDimensions` | Request succeeds and values round-trip back in response/UI | `llmModelApi.test.ts` plus browser QA |
| LLM create/update payload is mechanically wrapped in `toSnakeBody()` | Endpoint contract drifts; request can 422 or silently miss extended fields | Regression test on request body shape |
| `embeddingModelConfigId` empty in KB settings form | Client-side Zod validation blocks submit | `KnowledgeBaseDetailPage` form test |
| KB settings page receives mixed chat + embedding models | UI filters to embedding-only choices | `KnowledgeBaseDetailPage.test.tsx` |
| `embeddingDimensions <= 0` | Backend validation rejects the request | DTO contract in server + manual negative test if API changes |

### 5. Good / Base / Bad Cases

- Good: create a private-cloud embedding model with `modelType: 'embedding'`, `modelName: 'Qwen/Qwen3-Embedding-8B'`, and `embeddingDimensions: 4096`; the list card shows `Embedding` and `维度: 4096`, and KB settings can bind it.
- Base: a normal chat model omits `embeddingDimensions`, stays selectable for chat use, and never appears in the KB embedding-model selector.
- Bad: a frontend refactor blindly adds `toSnakeBody(config)` back into `llmModelApi.ts`, causing `modelType` / `embeddingDimensions` round-trip regressions.

### 6. Tests Required

- `src/features/llm/api/llmModelApi.test.ts`
  - Assert create/update requests send camelCase `modelType` and `embeddingDimensions`.
- `src/features/knowledge/components/KnowledgeBaseDetailPage.test.tsx`
  - Assert the settings form only shows embedding models and submits `embeddingModelConfigId`.
- Browser/manual QA:
  - Search for the configured embedding model in `LLM Models`.
  - Confirm the card renders `Embedding` and the configured dimension.
  - Open KB detail and confirm the same model is selectable/bound.

### 7. Wrong vs Correct

#### Wrong

```ts
export async function createLlmModel(config: CreateLlmModelInput) {
  return apiClient.post('llm-models', { json: toSnakeBody(config) });
}
```

#### Correct

```ts
export async function createLlmModel(config: CreateLlmModelInput) {
  return apiClient.post('llm-models', { json: config });
}
```

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
3. **Blindly applying `toSnakeBody()` to every API request** -- only use it when the backend contract explicitly accepts snake_case
4. **Skipping `gcTime: 0` on mutations** -- always set to avoid stale mutation cache

---

## Examples

- Complete API layer: `src/features/agent/api/`
- WebSocket hook: `src/features/execution/hooks/useExecutionSocket.ts`
- Query key factory: `src/features/agent/api/agentKeys.ts`
