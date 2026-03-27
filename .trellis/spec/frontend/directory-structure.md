# Directory Structure

> How frontend code is organized in agentloom-studio.

---

## Overview

agentloom-studio uses **Feature-Slice Architecture** with clear layer separation. Each feature is a self-contained module with barrel exports, and cross-feature imports must target the barrel `index.ts`.

---

## Directory Layout

```
agentloom-studio/src/
├── app/                    # Application shell
│   ├── providers.tsx       # QueryClientProvider > ToastProvider > RouterProvider
│   ├── router.tsx          # createRouter({ routeTree }) + module augmentation
│   └── routes/             # TanStack Router route definitions
│       ├── __root.tsx      # Root layout (auth guard + nav bar)
│       ├── index.tsx       # Home route
│       ├── auth/           # /login, /register, /auth/callback
│       ├── agents/         # /agents, /agents/$agentId
│       ├── executions/     # /executions
│       ├── settings/       # /settings/*
│       └── ...
├── features/               # Feature-Slice modules (31 modules)
│   ├── agent/              # Agent definition CRUD
│   ├── agent-canvas/       # Agent-specific canvas nodes/panels
│   ├── agent-conversation/ # Chat with agents
│   ├── agent-memory/       # Memory graph + audit
│   ├── audit-log/          # Audit log viewing
│   ├── auth/               # Supabase PKCE + MFA
│   ├── block-library/      # Reusable workflow blocks
│   ├── canvas/             # Visual workflow editor (largest feature)
│   ├── developer-console/  # Developer earnings
│   ├── evidence/           # Evidence chain + verification
│   ├── execution/          # Workflow execution + WebSocket + terminal
│   ├── intervention-policy/# HITL intervention policies
│   ├── knowledge/          # Knowledge base management
│   ├── llm/                # LLM provider config + API keys
│   ├── marketplace/        # Template marketplace
│   ├── mcp/                # MCP tool library
│   ├── monitoring/         # System monitoring dashboard
│   ├── notification/       # Notification bell + WebSocket
│   ├── onboarding/         # New user onboarding flow
│   ├── optimization-suggestion/ # Workflow optimization hints
│   ├── organization-autonomy-policy/ # Org-level autonomy
│   ├── plugin/             # Plugin management
│   ├── private-deployment/ # Private deployment settings
│   ├── resource-governance/# Resource quota management
│   ├── share/              # Public share links
│   ├── skill/              # Agent skill browsing
│   ├── smart-routing/      # Smart routing strategies
│   ├── template/           # Workflow templates
│   ├── tenant-key/         # Client-side encryption keys
│   ├── trigger/            # Workflow triggers
│   └── workflow/           # Workflow versioning/publishing
├── shared/                 # Cross-cutting shared code
│   ├── api/
│   │   ├── client.ts       # ky-based API client (auth + snake/camel hooks)
│   │   └── queryClient.ts  # TanStack QueryClient singleton
│   ├── components/
│   │   └── Pagination.tsx
│   ├── lib/
│   │   ├── supabase.ts     # Supabase client singleton
│   │   └── utils.ts        # cn() helper (clsx + tailwind-merge)
│   ├── types/
│   │   └── api.ts          # ApiResponse<T>, PaginatedResponse<T>, ApiError
│   ├── ui/                 # Shared UI primitives (CVA + forwardRef)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── slider.tsx
│   │   ├── switch.tsx
│   │   ├── tabs.tsx
│   │   └── toast.tsx
│   └── utils/
│       └── caseConverter.ts # snakeToCamel / camelToSnake recursive
├── main.tsx                # Entry point (StrictMode + AppProviders)
├── index.css               # Global styles
├── test-setup.ts           # Vitest global setup
└── vite-env.d.ts           # Vite type declarations
```

---

## Module Organization

### Feature Module Internal Structure

Each feature follows a canonical internal layout:

```
features/{feature-name}/
├── api/
│   ├── {feature}Api.ts         # Raw HTTP functions (ky calls)
│   ├── {feature}Keys.ts        # TanStack Query key factory
│   ├── {feature}Queries.ts     # useQuery hooks
│   └── {feature}Mutations.ts   # useMutation hooks
├── components/
│   ├── {Feature}ListPage.tsx
│   ├── {Feature}Panel.tsx
│   └── __tests__/              # Colocated tests (optional)
├── hooks/                      # Feature-specific custom hooks
├── stores/
│   └── {feature}Store.ts       # Zustand store (if needed)
├── types/
│   ├── {feature}.types.ts      # Domain types
│   └── index.ts                # Type barrel (export type only)
└── index.ts                    # Public barrel (ONLY import target)
```

Larger features like `canvas` add a `lib/` directory for pure-logic utilities:

```
features/canvas/
├── lib/
│   ├── typeEngine/             # Sub-module with its own files
│   ├── coercionStrategies.ts
│   ├── configSchemaToZod.ts
│   ├── dagValidator.ts
│   └── ...
├── components/
│   ├── edges/
│   ├── navigation/
│   ├── nodes/
│   ├── overlays/
│   ├── panels/
│   ├── status/
│   └── toolbar/
└── ...
```

---

## Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Feature directory | kebab-case | `agent-conversation/` |
| Component file | PascalCase | `AgentListPage.tsx` |
| Hook file | camelCase with `use` prefix | `useAuth.ts` |
| API file | camelCase | `agentDefinitionApi.ts` |
| Store file | camelCase | `agentStore.ts` |
| Type file | kebab-case + `.types.ts` suffix | `agent.types.ts` |
| Test file | same name + `.test.tsx` | `ReviewActions.test.tsx` |
| Barrel export | always `index.ts` | `features/agent/index.ts` |

---

## Import Rules

1. **Cross-feature imports MUST use barrel**: `import { AgentCard } from '@/features/agent'`
2. **Never import feature internals**: `import { ... } from '@/features/agent/components/AgentCard'` is forbidden
3. **Path alias**: Use `@/` for `src/` (configured in tsconfig.json)
4. **Shared layer**: Free to import from `@/shared/*`

---

## Examples

- Well-structured standard feature: `src/features/agent/`
- Complex feature with sub-modules: `src/features/canvas/`
- Shared UI layer: `src/shared/ui/`
