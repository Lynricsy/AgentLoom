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

### Agent Canvas Node Registry Sync

Agent Canvas 新增或修复节点时，不能只改 `CanvasNode.tsx` 或单个面板。`agent-canvas` 有一套独立于 workflow canvas 的节点注册和持久化快照加载链路，任何一处漏同步都会导致真实页面回退成 ReactFlow 默认方块节点，或者旧 Agent 继续保留过期端口元数据。

#### 必须同步的文件

| 文件 | 责任 |
|------|------|
| `features/canvas/registry/agent-canvas-registry.ts` | Agent Canvas 节点定义、端口契约、`maxInstances` |
| `features/agent-canvas/components/AgentCanvas.tsx` | ReactFlow `nodeTypes` 映射；新增 category 时必须补渲染映射 |
| `features/canvas/components/AgentNodePalette.tsx` | Agent 画布 palette 暴露入口 |
| `features/agent-canvas/stores/agent-canvas.store.ts` | 历史快照加载与节点端口归一化 |

#### 快照归一化规则

- **固定端口节点**：加载历史快照时，必须使用 `AGENT_CANVAS_NODE_REGISTRY` 重新注水 `inputPorts/outputPorts`，否则旧 Agent 会继续显示已经过期的端口类型。
- **动态端口节点**：如果节点允许用户运行时增删端口，则应保留持久化端口定义，不要被 registry 覆盖。
- 当前 `smart-routing` 属于动态端口节点；像 `agent-main`、`memory`、`sandbox` 这类固定端口节点必须走归一化。

#### 典型失败模式

- registry 已新增节点，但 `AgentCanvas.tsx` 的 `nodeTypes` 没更新：
  - 浏览器会显示 ReactFlow 默认长方形节点。
- registry 的端口类型已修正，但旧快照仍保留旧 `inputPorts/outputPorts`：
  - 真实页面上节点正文正常，但连线兼容判断仍按旧端口类型执行。
- palette 未同步：
  - 老 Agent 能显示，新建 Agent 却拖不出该节点。

---

## Examples

- Shared UI primitives: `src/shared/ui/button.tsx`, `src/shared/ui/input.tsx`
- Feature component with memo: `src/features/agent/components/AgentListPage.tsx`
- Complex canvas node: `src/features/canvas/components/CanvasNode.tsx`
- Radix composition: `src/shared/ui/toast.tsx`
