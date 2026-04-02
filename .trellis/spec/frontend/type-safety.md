# Type Safety

> Type safety patterns in agentloom-studio.

---

## Overview

TypeScript is configured in **strict mode** with additional strictness (`noUncheckedIndexedAccess`). Types are organized in feature-level `types/` directories with barrel exports. Zod is used for runtime validation (forms and dynamic schemas).

---

## TypeScript Configuration

From `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "target": "ES2022",
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

Key: `noUncheckedIndexedAccess: true` forces explicit undefined checks on array/object index access.

---

## Type Organization

### Domain Types

Types live in `features/*/types/` directories:

```ts
// src/features/agent/types/agent.types.ts
export type AgentStatus = 'draft' | 'published' | 'archived'

export interface AgentDefinition {
  id: string
  tenantId: string
  name: string
  slug: string
  description: string | null     // nullable from API
  systemPrompt: string | null
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  // ...
}
```

Conventions:
- **String union types** for enums (`type Status = 'draft' | 'published'`)
- **`string | null`** for nullable API fields (not `string | undefined`)
- **`interface`** for domain objects

### Type Barrel Exports

Every type directory has a barrel `index.ts` using **`export type` only**:

```ts
// src/features/agent/types/index.ts
export type { AgentStatus, AgentDefinition, AgentVersion } from './agent.types'
export type { AgentNodeData, AgentCanvasNodeData } from './agent-node.types'
```

### API Response Types

Shared generic types in `src/shared/types/api.ts`:

```ts
export interface ApiResponse<T> { data: T }

export interface ApiError {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}
```

All API functions type their return: `.json<ApiResponse<AgentDefinition>>()`.

### API Payload Types

Defined inline in the API file, co-located with the functions that use them:

```ts
// src/features/agent/api/agentDefinitionApi.ts
export interface CreateAgentPayload { name: string; description?: string }
export interface UpdateAgentPayload { version: number; name?: string; ... }
export type AgentListResponse = PaginatedResponse<AgentDefinition>
```

---

## Validation

### Form Validation (Zod + react-hook-form)

Used in 17+ files across the codebase:

```ts
// src/app/routes/auth/login.tsx
const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
})
type LoginFormValues = z.infer<typeof loginSchema>

// In component:
const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
  resolver: zodResolver(loginSchema),
})
```

Convention: define schema first, derive type with `z.infer<typeof schema>`.

### Dynamic Schema Generation

Backend `NodeConfigSchema` JSON converted to Zod at runtime:

```ts
// src/features/canvas/lib/configSchemaToZod.ts
// Converts backend config schema to Zod for dynamic form validation
```

---

## Router Type Safety

Module augmentation for end-to-end route type safety:

```ts
// src/app/router.tsx
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

Enables typed `useParams`, `Link to=`, and route search params.

---

## Common Patterns

1. **Path alias**: Always `@/` for `src/` paths
2. **`as const` tuples**: For query key factories
3. **Generic API responses**: `ApiResponse<T>`, `PaginatedResponse<T>`
4. **Type narrowing**: Prefer type guards over type assertions
5. **Compatibility adapters preserve round-trip data**: 当为旧组件扁平化嵌套实体时，必须用显式字段保留原始实体（例如 `providerEntity`），避免编辑态丢失 `baseUrl/apiKeyId/pricing tiers` 这类只存在于实体层的元数据

---

## Forbidden Patterns

1. **`as any` type assertions** -- `no-explicit-any` is off but `any` should be avoided
2. **`string | undefined` for nullable API data** -- use `string | null` to match backend
3. **Enum keyword** -- use string union types instead
4. **Non-type exports in type barrels** -- `types/index.ts` must use `export type` only
5. **Untyped API responses** -- always provide generic parameter to `.json<T>()`

---

## Examples

- Domain types: `src/features/agent/types/agent.types.ts`
- API response types: `src/shared/types/api.ts`
- Form validation: `src/app/routes/auth/login.tsx`
- Router type safety: `src/app/router.tsx`
