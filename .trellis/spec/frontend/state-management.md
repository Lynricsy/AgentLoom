# State Management

> How state is managed in agentloom-studio.

---

## Overview

The project uses a clear 3-tier state architecture. Each tier has a specific tool and use case. Mixing tiers (e.g., duplicating server state in Zustand) is an anti-pattern.

| Tier | Tool | When to Use |
|------|------|-------------|
| Server State | TanStack Query v5 | All API data (lists, details, mutations) |
| Global Client State | Zustand v5 | UI state shared across components |
| Local State | `useState` | Ephemeral component state (form fields, dialogs) |

---

## State Categories

### Server State (TanStack Query)

All data from the backend is managed by TanStack Query. Never store API responses in Zustand or useState.

- Query hooks in `features/*/api/*Queries.ts`
- Mutation hooks in `features/*/api/*Mutations.ts`
- Caching, invalidation, and refetching handled automatically
- See [Hook Guidelines](./hook-guidelines.md) for detailed patterns

### Global Client State (Zustand)

Used for UI state that needs to be shared across unrelated components. The project has 8 Zustand stores:

| Store | Location | Purpose |
|-------|----------|---------|
| `useAuthStore` | `features/auth/stores/auth.store.ts` | Session, user, tokens |
| `useAgentStore` | `features/agent/stores/agentStore.ts` | Agent list filters, selected ID |
| `useCanvasStore` | `features/canvas/stores/canvasStore.ts` | Canvas editor state |
| `useExecutionStore` | `features/execution/stores/executionStore.ts` | Execution tracking |
| `useEvidenceUiStore` | `features/evidence/stores/evidenceUiStore.ts` | Evidence panel UI |
| `useNotificationStore` | `features/notification/stores/notificationStore.ts` | Notification state |
| `agent-conversation.store` | `features/agent-conversation/stores/` | Conversation UI state |
| `agent-canvas.store` | `features/agent-canvas/stores/` | Agent canvas state |

### Local State (useState)

For form inputs, dialog open/close, loading spinners, and any state that doesn't leave the component tree.

### URL State (TanStack Router)

Route params accessed via typed hooks:

```tsx
const { agentId } = agentDetailRoute.useParams()
```

Filter/pagination state currently lives in Zustand stores (e.g., `agentStore.filters`), not URL search params.

---

## Zustand Store Conventions

### Standard Store Setup

All stores are **triple-wrapped**: `devtools(immer((set) => ...))` or `devtools(subscribeWithSelector(immer(...)))`.

```ts
// src/features/agent/stores/agentStore.ts
export const useAgentStore = create<AgentState & AgentActions>()(
  devtools(
    immer((set) => ({
      filters: { ...DEFAULT_FILTERS },
      selectedAgentId: null,

      setFilters: (partial) =>
        set(
          (state) => { Object.assign(state.filters, partial); state.filters.page = 1 },
          false,
          'agent/setFilters',     // devtools action label (REQUIRED)
        ),
      resetFilters: () =>
        set(
          { filters: { ...DEFAULT_FILTERS }, selectedAgentId: null },
          false,
          'agent/resetFilters',
        ),
    })),
    { name: 'AgentStore' },       // devtools store name
  ),
)
```

Rules:
- State and Actions are **separate interfaces**, combined via `create<State & Actions>()()`
- Every `set()` call has a **devtools action label** in `'feature/actionName'` format
- Store name passed to `devtools({ name: 'StoreName' })`
- `immer` middleware for immutable-style mutations

### Complex Store with Actions Namespace

For stores with many actions, nest them in an `actions` object and export focused selector hooks:

```ts
// src/features/evidence/stores/evidenceUiStore.ts
export const useEvidenceUiStore = create<EvidenceUiState & EvidenceUiActions>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...createInitialState(),
        actions: {
          openPanel: (...) => set((s) => { ... }, false, 'evidence-ui/openPanel'),
          closePanel: () => set((s) => { ... }, false, 'evidence-ui/closePanel'),
          reset: () => set(createInitialState(), false, 'evidence-ui/reset'),
        },
      })),
    ),
    { name: 'EvidenceUiStore' },
  ),
)

// Focused selector hooks (prevent subscribing to entire store)
export const useEvidenceUiIsOpen = () => useEvidenceUiStore((s) => s.isOpen)
export const useEvidenceUiSelectedId = () => useEvidenceUiStore((s) => s.selectedEvidenceId)
export const useEvidenceUiActions = () => useEvidenceUiStore((s) => s.actions)
```

### Multi-Field Selection with useShallow

When a component needs multiple store fields, use `useShallow` to prevent unnecessary re-renders:

```ts
// src/features/auth/hooks/useAuth.ts
import { useShallow } from 'zustand/react/shallow'

export function useAuth() {
  return useAuthStore(
    useShallow((state) => ({
      session: state.session,
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      signOut: state.signOut,
    })),
  )
}
```

### Outside-React Access

Use `getState()` for non-React contexts (API hooks, initialization):

```ts
// src/shared/api/client.ts
await useAuthStore.getState().signOut()
```

---

## When to Use Global State

Promote to Zustand only when:
- State is needed by **unrelated** component subtrees
- State needs to be accessed **outside React** (API hooks, socket handlers)
- State persists across route navigations

**Do NOT use Zustand** for:
- Server data (use TanStack Query)
- Form state (use useState or react-hook-form)
- State within a single component tree (use useState + prop drilling or context)

---

## Forbidden Patterns

1. **Duplicating server state in Zustand** -- TanStack Query is the source of truth for API data
2. **`useStore((s) => s)` selecting everything** -- use focused selectors or `useShallow`
3. **Missing devtools action labels** -- every `set()` must have a traceable action name
4. **Skipping immer middleware** -- all stores use immer for immutable updates
5. **Direct state mutation** -- even with immer, don't mutate outside of `set()` callbacks

---

## Examples

- Simple store: `src/features/agent/stores/agentStore.ts`
- Complex store with actions namespace: `src/features/evidence/stores/evidenceUiStore.ts`
- useShallow usage: `src/features/auth/hooks/useAuth.ts`
- Outside-React access: `src/shared/api/client.ts`
