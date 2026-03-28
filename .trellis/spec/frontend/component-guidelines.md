# Component Guidelines

> How components are built in agentloom-studio.

---

## Overview

Components follow three distinct patterns based on their role: **Shared UI Primitives** (forwardRef + CVA), **Feature Components** (memo for perf-critical), and **Page Components** (plain functions). Styling uses Tailwind CSS 4 with CVA variants and Radix UI primitives.

---

## Component Patterns

### Pattern A: Shared UI Primitives (forwardRef + CVA)

Used in `shared/ui/`. Low-level building blocks. All 8 files in `shared/ui/` follow this pattern.

```tsx
// src/shared/ui/button.tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ...',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-border bg-background text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
})
```

Key rules:
- **Named function expression** inside `forwardRef` (not anonymous arrow) for DevTools display
- Props interface extends native HTML attributes + CVA `VariantProps`
- `cn()` merges CVA output with caller `className`
- Export both the component and the variants for external reuse

### Pattern B: Feature Components with memo()

Used for list items, cards, and frequently re-rendered components.

```tsx
// src/features/agent/components/AgentListPage.tsx
const AgentCard = memo(function AgentCard({ agent, onClick }: AgentCardProps) {
  return (
    <div className="rounded-lg border border-border p-4 hover:bg-muted/50" onClick={onClick}>
      {/* card content */}
    </div>
  )
})
```

Rule: always `memo(function ComponentName(...))` -- never anonymous arrows.

### Pattern C: Page Components (Plain Functions)

Route-level components are plain exported functions, co-located with route definition.

```tsx
// src/app/routes/auth/login.tsx
export function LoginPage() {
  // hooks, state, handlers...
  return (
    <AuthLayout>
      {/* page content */}
    </AuthLayout>
  )
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})
```

### Pattern D: Radix Primitives Composition

Wrap Radix primitives with project-specific styling and context.

```tsx
// src/shared/ui/toast.tsx
import * as ToastPrimitives from '@radix-ui/react-toast'

export function ToastProvider({ children }: PropsWithChildren) {
  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitives.Provider swipeDirection="right">
        {children}
        <ToastPrimitives.Viewport ... />
      </ToastPrimitives.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within a ToastProvider')
  return context
}
```

---

## Props Conventions

1. **Extend native HTML attributes** for primitive components:
   ```tsx
   interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}
   ```

2. **Use interface for domain props** in feature components:
   ```tsx
   interface AgentCardProps {
     agent: AgentDefinition
     onClick: (id: string) => void
   }
   ```

3. **`string | null` for nullable API fields** (not `string | undefined`):
   ```tsx
   interface AgentDefinition {
     description: string | null
     systemPrompt: string | null
   }
   ```

4. **`data-testid` for test targeting**:
   ```tsx
   <button data-testid="create-agent-btn" ... />
   ```

---

## Styling Patterns

| Tool | Purpose | Example |
|------|---------|---------|
| **Tailwind CSS 4** | All styling | `className="rounded-lg border p-4"` |
| **CVA** | Variant-driven primitives | `buttonVariants({ variant: 'outline' })` |
| **cn()** | Conditional class merging | `cn('base-class', isActive && 'active-class')` |
| **Radix UI** | Accessible primitives | Dialog, Popover, Toast, Select |
| **lucide-react** | Icons | `<Plus className="h-4 w-4" />` |

Design tokens are CSS-variable-based: `text-foreground`, `bg-primary`, `border-border`, `text-muted-foreground`.

**No CSS Modules or styled-components** are used anywhere in the project.

---

## Accessibility

- Radix UI provides keyboard navigation and ARIA attributes out of the box
- `Button` component defaults `type='button'` to prevent accidental form submissions
- Interactive elements use `data-slot` attributes for structural semantics

---

## Forbidden Patterns

1. **Anonymous arrows in memo/forwardRef** -- always use named function expressions
2. **Empty `interface {}` for props** -- extend native HTML attributes instead
3. **Inline styles** -- use Tailwind classes
4. **CSS Modules / styled-components** -- not used in this project
5. **Direct Radix imports in features** -- wrap in `shared/ui/` first (for project-level consistency)

---

## Canvas Node Config Panel Registry

Canvas 中每种节点的配置面板通过共享注册表 `CUSTOM_PANEL_REGISTRY` 集中管理，确保 Workflow Canvas 和 Agent Canvas 使用同一套面板实现。

### 架构

```
customPanelRegistry.tsx        ← 单一数据源：节点类型 → 面板渲染函数
  ├── NodeConfigPanel.tsx      ← Workflow Canvas 使用
  └── AgentNodeConfigPanel.tsx ← Agent Canvas 使用
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `canvas/components/panels/customPanelRegistry.tsx` | 面板注册表定义 + 所有面板组件 import |
| `canvas/components/panels/NodeConfigPanel.tsx` | Workflow Canvas 面板容器，查表渲染 |
| `agent-canvas/components/panels/AgentNodeConfigPanel.tsx` | Agent Canvas 面板容器，查表渲染 |

### 新增节点配置面板

1. 创建面板组件（如 `MyToolConfigPanel.tsx`），遵循 Pattern B（memo + named function）
2. 在 `customPanelRegistry.tsx` 中 import 并注册：
   ```tsx
   'my-tool': {
     render: ({ node, onConfigChange }) => (
       <MyToolConfigPanel config={node.data.config} onApply={onConfigChange} />
     ),
   },
   ```
3. 两个 Canvas 自动生效，无需分别修改

### 注意事项

- **禁止**在 `AgentNodeConfigPanel` 或 `NodeConfigPanel` 中直接写面板 switch/case
- 面板的 `onApply` 签名应接受 `Record<string, unknown>` patch 对象
- 如果面板需要管理自身验证状态，设置 `handlesValidation: true` 并使用 `onValidationChange` 回调

---

## Examples

- Shared UI primitives: `src/shared/ui/button.tsx`, `src/shared/ui/input.tsx`
- Feature component with memo: `src/features/agent/components/AgentListPage.tsx`
- Complex canvas node: `src/features/canvas/components/CanvasNode.tsx`
- Radix composition: `src/shared/ui/toast.tsx`
