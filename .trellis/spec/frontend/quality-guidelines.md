# Quality Guidelines

> Code quality standards for agentloom-studio frontend development.

---

## Overview

The project uses ESLint 9 flat config, Prettier with Tailwind plugin, Vitest 4 for testing, and strict TypeScript. Build fails on type errors. No coverage threshold enforced on studio (server has 80% threshold).

---

## Linting

### ESLint Configuration

ESLint 9 flat config (`eslint.config.js`):

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,   // enforces hooks rules
      reactRefresh.configs.vite,             // enforces fast-refresh compatibility
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
```

Key rules:
- `typescript-eslint` recommended rules
- `react-hooks` rules enforced (exhaustive-deps, rules of hooks)
- `react-refresh` rules for Vite HMR compatibility
- `no-explicit-any: off` (project-wide -- but avoid `any` when possible)

### Prettier

Default Prettier settings + `prettier-plugin-tailwindcss` for automatic class sorting.

Command: `pnpm format` runs `prettier --write .`

From AGENTS.md: `singleQuote: true`, `trailingComma: 'all'`.

---

## Testing

### Framework

**Vitest 4** + **React Testing Library** + **jsdom**

### Test File Placement

Two patterns are used:
- **Colocated**: `components/__tests__/ComponentName.test.tsx`
- **Sibling**: `ComponentName.test.tsx` next to the source file

### Test Conventions

```tsx
// Typical test file structure
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock setup with vi.hoisted()
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn(),
}))
vi.mock('@/features/agent', () => ({
  useAgent: mockFn,
}))

// Test data factory
function makeAgent(overrides = {}): AgentDefinition {
  return { id: 'test-1', name: 'Test Agent', ...overrides }
}

// Query provider wrapper
function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('AgentCard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders agent name', () => {
    render(<AgentCard agent={makeAgent()} />, { wrapper: createWrapper() })
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
  })
})
```

Key patterns:
- `vi.hoisted()` + `vi.mock()` for module mocking
- `createWrapper()` helper provides QueryClientProvider with `retry: false`
- Factory functions like `makeAgent()` for test data
- `data-testid` attributes for element selection
- Test descriptions can be in Chinese

### Commands

```bash
pnpm test              # vitest run (single run)
pnpm test:watch        # vitest (watch mode)
pnpm test:coverage     # vitest run --coverage (@vitest/coverage-v8)
```

---

## Build & Typecheck

```bash
pnpm build             # tsc -b && vite build (TypeScript first, then Vite)
pnpm typecheck         # tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json
```

Build fails on any TypeScript error. Both app and node configs are checked.

---

## Required Patterns

1. **Barrel imports for cross-feature access** -- never import feature internals
2. **Query key factory** -- never use loose string keys
3. **Named functions in memo/forwardRef** -- never anonymous arrows
4. **Devtools action labels on Zustand set()** -- every mutation must be traceable
5. **`gcTime: 0` on mutations** -- garbage collect immediately
6. **`toSnakeBody()` for API payloads** -- centralized conversion
7. **`cn()` for class merging** -- never manual string concatenation

---

## Forbidden Patterns

1. **CSS Modules / styled-components** -- Tailwind only
2. **`useStore((s) => s)` without selector** -- use focused selectors or `useShallow`
3. **Inline API calls in components** -- extract to API layer
4. **Direct snake/camel conversion in API functions** -- centralized client handles it
5. **`enum` keyword** -- use string union types
6. **Skipping `enabled` guard on detail queries** -- always `enabled: !!id`
7. **Duplicating server state in Zustand** -- TanStack Query is source of truth

---

## Code Review Checklist

- [ ] Imports use barrel `index.ts` (no deep imports into features)
- [ ] New components follow the correct pattern (UI primitive / feature / page)
- [ ] Query keys use the key factory
- [ ] Mutations have `gcTime: 0` and proper invalidation
- [ ] Zustand `set()` calls have devtools action labels
- [ ] Types use `string | null` for nullable fields (not undefined)
- [ ] No `any` without justification
- [ ] `data-testid` on interactive elements for testability
- [ ] Tailwind classes sorted (Prettier plugin handles this)
- [ ] `pnpm typecheck` passes

---

## Key Dependencies

| Category | Package | Version |
|----------|---------|---------|
| Framework | `react` | ^19.2.0 |
| Build | `vite` | ^7.3.1 |
| TypeScript | `typescript` | ~5.9.3 |
| Routing | `@tanstack/react-router` | ^1.166.2 |
| Data Fetching | `@tanstack/react-query` | ^5.90.21 |
| HTTP Client | `ky` | ^1.14.3 |
| State | `zustand` | ^5.0.11 |
| Immutability | `immer` | ^10.2.0 |
| Forms | `react-hook-form` + `@hookform/resolvers` | ^7.71.2 / ^5.2.2 |
| Validation | `zod` | ^4.3.6 |
| Styling | `tailwindcss` | ^4.2.1 |
| Variants | `class-variance-authority` | ^0.7.1 |
| Class Merge | `tailwind-merge` + `clsx` | ^3.5.0 / ^2.1.1 |
| UI Primitives | `@radix-ui/react-*` | Multiple |
| Canvas | `@xyflow/react` | ^12.10.1 |
| Auth | `@supabase/supabase-js` | ^2.99.3 |
| Icons | `lucide-react` | ^0.576.0 |
| WebSocket | `socket.io-client` | ^4.8.3 |
| Testing | `vitest` | ^4.0.18 |
| Test Utils | `@testing-library/react` | ^16.3.2 |

---

## Examples

- ESLint config: `agentloom-studio/eslint.config.js`
- Test setup: `agentloom-studio/src/test-setup.ts`
- Test with mocks: `src/features/agent-memory/components/audit/__tests__/ReviewActions.test.tsx`
