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

## Scenario: LLM Model + Knowledge Base Strategy Forms

### 1. Scope / Trigger

- Trigger: touching `src/features/llm/api/llmModelApi.ts`, `src/features/knowledge/api/knowledgeBaseApi.ts`, LLM model config dialogs/panels, or knowledge-base detail forms that edit retrieval strategies.

### 2. Signatures

- `createLlmModel(config: CreateLlmModelInput): Promise<LlmModelInfo>`
- `updateLlmModel(id: string, config: UpdateLlmModelInput): Promise<LlmModelInfo>`
- `createKnowledgeBase(input: CreateKnowledgeBaseInput): Promise<KnowledgeBase>`
- `updateKnowledgeBaseSettings(id: string, input: UpdateKnowledgeBaseSettingsInput): Promise<KnowledgeBase>`
- `testKnowledgeBaseSearch(id: string, input: { query: string; topK?: number }): Promise<KnowledgeTestSearchResponse>`
- `KnowledgeBaseDetailPage` settings form fields:
  - `embeddingModelConfigId`
  - `chunkingStrategy`
  - `retrievalStrategy`
  - `rerankingStrategy`
  - `queryOrchestration`
- `LlmModelInfo` contract fields used by the UI:
  - `modelType: 'chat' | 'embedding'`
  - `embeddingDimensions?: number | null`

### 3. Contracts

- `llmModelApi.ts` must send LLM model payloads in camelCase because the backend DTO contract uses camelCase fields such as `modelType` and `embeddingDimensions`.
- `knowledgeBaseApi.ts` must continue using `toSnakeBody()` for create/update/test-search payloads so nested strategy fields like `chunkingStrategy`, `retrievalStrategy.topK`, `rerankingStrategy.timeoutMs`, and `queryOrchestration.modelConfigId` survive transport to the backend aliases.
- Knowledge base settings must submit `embeddingModelConfigId`, strategy objects, and test-search params through the API helpers instead of hand-rolling request bodies in components.
- The knowledge-base embedding selector must only offer models where `modelType === 'embedding'`.
- Knowledge-base detail UI must surface the per-base strategy state, unified `search_knowledge` tool hint, test-search entry, and rebuild entry from the same canonical query data.
- LLM model management cards/dialogs must surface both the usage (`Chat` or `Embedding`) and the configured embedding dimension when present.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Verification Point |
|-----------|-------------------|--------------------|
| LLM create/update payload uses camelCase `modelType` / `embeddingDimensions` | Request succeeds and values round-trip back in response/UI | `llmModelApi.test.ts` plus browser QA |
| LLM create/update payload is mechanically wrapped in `toSnakeBody()` | Endpoint contract drifts; request can 422 or silently miss extended fields | Regression test on request body shape |
| KB create/update payload omits `toSnakeBody()` | Nested strategy fields drift or fail alias parsing on the backend | `knowledgeBaseApi.test.ts` plus form submit test |
| `embeddingModelConfigId` empty in KB settings form | Client-side validation still allows “provider default embedding” by submitting `null` when unbound | `KnowledgeBaseDetailPage` form test |
| KB settings page receives mixed chat + embedding models | UI filters to embedding-only choices | `KnowledgeBaseDetailPage.test.tsx` |
| User changes chunking/rerank/orchestration controls | Submitted payload preserves the active discriminated union shape | `KnowledgeBaseDetailPage.test.tsx` |
| User runs test search | UI calls `testKnowledgeBaseSearch()` and renders returned hits | `KnowledgeBaseDetailPage.test.tsx` |
| `embeddingDimensions <= 0` | Backend validation rejects the request | DTO contract in server + manual negative test if API changes |

### 5. Good / Base / Bad Cases

- Good: create a private-cloud embedding model with `modelType: 'embedding'`, `modelName: 'Qwen/Qwen3-Embedding-8B'`, and `embeddingDimensions: 4096`; then configure a knowledge base with `sentence_window` chunking, Cohere rerank, and HyDE orchestration; the detail page persists those strategies and test-search returns hits.
- Base: a normal chat model omits `embeddingDimensions`, stays selectable for chat use, and never appears in the KB embedding-model selector; a knowledge base with default strategies still renders the unified `search_knowledge` hint.
- Bad: a frontend refactor blindly removes `toSnakeBody()` from `knowledgeBaseApi.ts`, causing nested strategy payloads such as `queryOrchestration.modelConfigId` or `retrievalStrategy.topK` to drift.

### 6. Tests Required

- `src/features/llm/api/llmModelApi.test.ts`
  - Assert create/update requests send camelCase `modelType` and `embeddingDimensions`.
- `src/features/knowledge/api/knowledgeBaseApi.test.ts`
  - Assert create/update/test-search requests send nested strategy fields through `toSnakeBody()`.
- `src/features/knowledge/components/KnowledgeBaseDetailPage.test.tsx`
  - Assert the settings form only shows embedding models and submits `embeddingModelConfigId`.
  - Assert strategy edits, test-search, rebuild, and unified `search_knowledge` hint all render from canonical knowledge-base state.
- Browser/manual QA:
  - Search for the configured embedding model in `LLM Models`.
  - Confirm the card renders `Embedding` and the configured dimension.
  - Open KB detail and confirm the same model is selectable/bound, strategy controls round-trip, and test-search works.

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

## Scenario: LLM Provider Direct API Key Forms

### 1. Scope / Trigger

- Trigger: touching `src/features/llm/components/*`, `src/features/llm/api/llmModelApi.ts`, or `src/features/llm/hooks/useLlmModels.ts` while changing how Provider credentials are entered or how private cloud raw testing works.

### 2. Signatures

- `CreateLlmProviderInput`
- `UpdateLlmProviderInput`
- `testPrivateCloudConnection(input: TestConnectionInput)`
- `fetchPrivateCloudModels(input: FetchModelsInput)`
- `ManagedApiKeyField`
- `buildProviderCredentialInput(options): UpdateLlmProviderInput | null`
- `hasEffectiveProviderApiKey(options): boolean`

### 3. Contracts

- Provider editor, model config dialog, and canvas `LlmModelConfigPanel` must use direct plaintext `apiKey` input instead of requiring the user to preselect an `apiKeyId`.
- Frontend must never attempt to echo back stored plaintext keys; edit forms only expose:
  - empty password input
  - “已配置，留空保持不变”
  - optional “移除当前 Key”
- For private cloud raw test/discovery:
  - if the user typed a new `apiKey`, send `apiKey`
  - else if the selected Provider already has `apiKeyId`, send `apiKeyId`
- Provider-level credential edits must be treated as Provider-global changes and the UI should say so explicitly.
- `UpdateLlmProviderInput.baseUrl` must allow `null`; do not type it through `Partial<CreateLlmProviderInput>` alone, or `null` will be lost by intersection.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Verification Point |
|-----------|-------------------|--------------------|
| Private cloud + `authMethod='api_key'` + no stored key + empty input | Disable test/discovery and surface “请输入 API Key” | `PrivateCloudConfigSection.test.tsx` |
| Private cloud + stored managed key + empty input | Allow test/discovery and send `apiKeyId` | `PrivateCloudConfigSection.test.tsx` |
| Private cloud + user typed new key | Send direct `apiKey` and ignore stored `apiKeyId` for that request | `llmModelApi.test.ts`, `PrivateCloudConfigSection.test.tsx` |
| Non-private-cloud Provider has stored key | Show “已配置，留空保持不变；输入新 key 会替换” | component render QA |
| User clicks remove current key | Submit `clearApiKey=true` instead of stale `apiKeyId=null` compatibility hacks | form submit assertions |
| `UpdateLlmProviderInput.baseUrl = null` | TypeScript accepts payload and API helper transmits `null` | `pnpm typecheck` |

## Scenario: Discover / Public Share / Resource Source APIs

### 1. Scope / Trigger

- Trigger:
  - 修改 `src/features/discover/`
  - 修改 `src/features/share/api/`
  - 修改 `src/shared/api/resourceSourceApi.ts`
  - 修改 workflow / agent / knowledge / memory / mcp / skill 列表页中的来源筛选与转正 mutation

### 2. Signatures

- `DiscoverPage(): JSX.Element`
- `MarketplaceBrowsePage({ mode }: { mode?: 'marketplace' | 'discover' })`
- `createShare(payload: CreateSharePayload): Promise<ShareRecord>`
- `listShares(params: ListSharesParams): Promise<ShareListResponse>`
- `revokeShare(resourceType: ShareResourceType, shareId: string): Promise<void>`
- `getPublicShare(token: string): Promise<PublicShareData>`
- `importAgentShare(token: string): Promise<ImportAgentShareResponse>`
- `convertResourceSourceToManual(resourceType, resourceId): Promise<ConvertResourceSourceResponse>`
- workflow / agent / knowledge / memory / mcp / skill list queries:
  - query param: `sourceKind=manual|share_imported`
  - response field: workflow / agent 用 `resourceSourceKind`，其余资源用 `sourceKind`

### 3. Contracts

- `/discover` 不能发明第二套 browse API；`DiscoverPage` 必须继续通过 `MarketplaceBrowsePage mode="discover"` 复用 marketplace public browse / detail / install 链路。
- 公开分享页 `getPublicShare(token)` 返回的 `PublicShareData` 必须保持按 `resourceType='workflow'|'agent'` 判别；页面逻辑不能靠字段缺失猜类型。
- workflow 分享导入必须继续走 workflow create clone source（`share_token`），而不是调用 `importAgentShare()`。
- `importAgentShare(token)` 只能用于 `resourceType='agent'`，并必须向 UI 暴露：
  - `agentDefinitionId`
  - `publishedVersionId`
  - `summary { cloned, cleared, needsRebind, skippedEphemeral }`
  - `report[]`
- `createShare()` 与 `listShares()` 必须根据 payload / params 的资源类型在 `workflow-shares` 与 `agent-shares` 之间切换 base path；前端不能把两个资源硬编码到单一路径。
- `convertResourceSourceToManual()` 必须放在 shared API 层，由 workflow / agent / knowledge / memory / mcp / skill 页面复用，不能在每个 feature 里重复造接口封装。
- 来源筛选 query param 统一用 `sourceKind` 发送；UI 读取时要接受后端当前 contract：
  - workflow / agent: `resourceSourceKind`
  - knowledge / memory / mcp / skill: `sourceKind`
- discover 与 marketplace 的区别只体现在页面语义 / copy / 默认入口，不体现在 API contract 上；公开分享 token 不能混进 discover 列表。

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Verification Point |
|-----------|-------------------|--------------------|
| `DiscoverPage` 渲染 | 复用 `MarketplaceBrowsePage mode=\"discover\"`，而不是新请求 discover API | `DiscoverPage` test / code review |
| `createShare()` 传入 workflow payload | 请求落到 `workflow-shares` | `ShareManagementDialog.test.tsx` |
| `createShare()` 传入 agent payload | 请求落到 `agent-shares` | `ShareManagementDialog.test.tsx` |
| workflow public share page 导入 | 走 workflow clone source，跳转 workflow 详情页 | `PublicSharePage.test.tsx` + browser QA |
| agent public share page 导入 | 调用 `importAgentShare()` 并渲染导入报告 | `PublicSharePage.test.tsx` + browser QA |
| 资源页筛选 `sourceKind=share_imported` | 列表只保留分享导入项 | 对应页面测试 + browser QA |
| 点击“转为自己创建” | 调用 shared `convertResourceSourceToManual()`，成功后列表标签与过滤结果刷新 | 页面测试 + browser QA |
| discover 详情对话框打开 | 必须有 `Dialog.Title` / `Dialog.Description`，控制台无 Radix a11y error | `MarketplaceDetailDialog.test.tsx` + browser QA |

### 5. Good / Base / Bad Cases

- Good: `/discover` 打开 listing 详情时复用 marketplace dialog，点击安装后跳到新 workflow；workflow / agent 分享页根据 `resourceType` 渲染不同 CTA；分享导入资源在列表上显示 `分享导入`，转正后立即变成 `自己创建`。
- Base: 公开分享页只做 preview + import，不进入 discover；agent import 报告显示 `已复制 / 已清空 / 待重绑` 计数，workflow import 直接进入工作流编辑页。
- Bad: discover 新建独立 API 层；或把 workflow / agent 分享导入都塞到同一个 mutation；或让每个资源页各自复制一份 `convert-to-manual` API helper。

### 6. Tests Required

- `src/features/marketplace/components/__tests__/MarketplaceDetailDialog.test.tsx`
  - Assert discover / marketplace detail dialog 保持 a11y title + description。
- `src/features/share/components/__tests__/PublicSharePage.test.tsx`
  - Assert workflow vs agent 判别渲染、workflow clone CTA、agent import report。
- `src/features/share/components/__tests__/ShareManagementDialog.test.tsx`
  - Assert workflow / agent share path routing。
- 各资源页页面测试 / store test:
  - Assert `sourceKind` filter round-trip。
  - Assert `convertResourceSourceToManual()` mutation refresh。
- Browser/manual QA:
  - discover 预览 / 导入 / 导入后运行
  - workflow share 预览 / 导入
  - agent share 预览 / 导入 / 错误透出
  - 分享导入资源转为自己创建

### 7. Wrong vs Correct

#### Wrong

```ts
export function DiscoverPage() {
  return <CustomDiscoverPageThatCalls('/discover/listings') />
}
```

#### Correct

```ts
export function DiscoverPage() {
  return <MarketplaceBrowsePage mode="discover" />
}
```

### 5. Good / Base / Bad Cases

- Good: user opens Provider panel, enters a new API key, saves, then immediately tests connection successfully.
- Base: user leaves the API key field empty on an already-configured Provider; no credential mutation is sent and the stored key remains active.
- Bad: UI pre-fills a masked or real API key into the input field, or forces the user to navigate to a separate API key management flow before creating a Provider/model.

### 6. Tests Required

- `src/features/llm/api/llmModelApi.test.ts`
  - Assert raw private cloud API helpers send direct `apiKey` / fallback `apiKeyId`.
- `src/features/llm/components/__tests__/PrivateCloudConfigSection.test.tsx`
  - Assert direct key input path, stored-key fallback path, and model discovery flow.
- `src/features/llm/components/LlmModelConfigPanel.test.tsx`
  - Assert panel still applies saved model patches after Provider credential sync support is introduced.
- Manual/browser QA:
  - Resource Provider panel direct key save
  - Model dialog direct key replace/remove
  - Canvas `LlmModelConfigPanel` create flow with direct key

### 7. Wrong vs Correct

#### Wrong

```tsx
<Select value={apiKeyId} onValueChange={setApiKeyId}>
  <option value="">请选择 API Key</option>
</Select>
```

#### Correct

```tsx
<ManagedApiKeyField
  value={apiKey}
  onValueChange={setApiKey}
  hasStoredApiKey={Boolean(provider.apiKeyId)}
  clearRequested={clearApiKey}
  onClearRequestedChange={setClearApiKey}
/>
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
