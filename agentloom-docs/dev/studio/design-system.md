---
docType: reference
---

# Studio 设计系统

> `agentloom-studio` 的视觉 token、原语选型与页面骨架规范。**所有** 呈现层改动以本文为唯一依据。
> 违反本文的写法由 `eslint.config.js` 的 `no-restricted-syntax` / `no-restricted-imports` 强制拦截，不允许 `eslint-disable`。

---

## 1. 分层

```
src/index.css  @theme            ← token 唯一来源（颜色/圆角/阴影/动效/尺寸/字号）
src/shared/ui/*                  ← 原语：唯一允许封装 Radix、唯一定义控件外观
src/shared/components/*          ← 页面骨架与复合组件（PageContainer / PageHeader / WorkbenchHeader / EmptyState …）
src/features/*                   ← 业务：只组合上面两层，不定义新的视觉语言
```

业务层不得：手写 `<button>`/`<textarea>`/`<select>`/`<input>`（`type=hidden|file` 除外）、手写卡片/弹窗/浮层壳、`import @radix-ui/*`、写 `<h1>`、使用 Tailwind 原生调色板。

---

## 2. 颜色 token

### 表面层级（固定三层）

| token | 角色 |
|---|---|
| `background` | 页面底 |
| `surface` | 卡片 / 侧栏 / 面板 / 弹窗 / 输入框 |
| `popover` | 浮层（Popover / Dropdown / Select / Tooltip / Toast） |
| `muted` | **次级表面**：hover 底、骨架屏、代码块、表头、well、segmented 底槽 |

`muted` 是背景色，不是文字色。输入框的「凹陷感」来自 `bg-surface` 输入框落在 `bg-surface` 卡片上时的描边与 `shadow-xs`，不靠深色底。

### 文字层级（固定三级）

| token | light | dark | 用途 |
|---|---|---|---|
| `foreground` | `#101828` | `#e8eaed` | 正文、标题 |
| `muted-foreground` | `#667085` | `#9aa3af` | 描述、label、meta（对白底 ≥4.5:1，达 AA） |
| `subtle-foreground` | `#98a2b3` | `#6b7280` | placeholder、disabled、时间戳、静息图标 |

### 语义与类别色

- 状态：`primary` / `success` / `warning` / `error` / `info` / `highlight`（`highlight` 专用于证据/引用命中，区别于 `warning`）。
- 描边：`border` / `border-hover`。
- 数据类型：`type-model|text|json|image|audio|tool|sandbox|knowledge|skill|agent|exec|volume`。
- 节点类别：`node-agent|tool|trigger|knowledge|output|control|plugin|memory|routing|preprocessing|skill`。
- 兼容性等级：`compat-l0|l1|l2|l3`。
- 品牌渐变：`var(--color-brand-gradient)`（仅 CSS 变量，无同名 Tailwind 颜色）。

### 已删除的 token（不得再出现）

| 旧 token | 原因 | 替代 |
|---|---|---|
| `card` / `card-foreground` | 与 `surface` / `foreground` 完全同值 | `surface` / `foreground` |
| `input` | 与 `border` 完全同值 | `border` |
| `brand` / `brand-foreground` | 与 `primary` / `primary-foreground` 完全同值 | `primary` / `primary-foreground` |
| `surface-elevated` | 与新 `muted` 同角色 | `muted` |
| `accent` | 从未定义（`hover:bg-accent` 是死类） | `muted` |

### 原生调色板 → 语义 token 映射

Tailwind 原生调色板（`slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose`）**不随主题切换**，light/dark 必有一侧不可读。一律按下表替换：

| 原生 | 语义 |
|---|---|
| `emerald` / `green` | `success` |
| `amber` / `yellow` / `orange` | `warning` |
| `red` / `rose` | `error` |
| `blue` / `sky` / `cyan` | `info` |
| `neutral` / `zinc` / `gray` / `slate` / `stone` | 按用途：底 `muted`、次级文字 `muted-foreground`、三级文字/静息图标 `subtle-foreground`、描边 `border`、卡片底 `surface` |
| `purple` / `violet` / `fuchsia` / `indigo` / `pink` / `teal` / `lime` | 表示节点/资源类别时用类别 token（`text-[var(--color-node-memory)]`、`<Badge tone="var(--color-node-skill)">`）；否则 `primary` |

透明度写法保留：`bg-emerald-500/10` → `bg-success/10`。
`text-white` 只允许落在 `destructive` 或实色 token 底上；`bg-white` 只允许出现在 `shared/ui/switch.tsx` 与 `BrandMark`。

---

## 3. 圆角

`@theme` 覆盖了 Tailwind 默认刻度，并注销 `2xl`/`3xl`/`4xl`。

| 类 | 值 | 用途 |
|---|---|---|
| `rounded-xs` | 4px | 行内 code、节点内微标签、Checkbox |
| `rounded-sm` | 6px | 菜单项、Tab 项、Tooltip、Skeleton |
| `rounded-md` | 8px | 控件：Button / Input / Select / Textarea / NavItem |
| `rounded-lg` | 12px | 卡片、Popover、Dropdown、Toast、画布节点、PageHeader 图标芯片 |
| `rounded-xl` | 16px | Dialog / Sheet / Command / 画布浮层面板 |

裸 `rounded`（Tailwind deprecated 的 4px）等价于 `rounded-xs`，允许存量保留。
`rounded-[inherit]` 允许（继承父级圆角）；`rounded-[<数字>px]` 禁止。

---

## 4. 阴影

`@theme` 用 `--shadow-*: initial` 整组重置后只保留 5 级，`:root.dark` 单独覆盖。

| 类 | 用途 |
|---|---|
| `shadow-xs` | 控件：outline/secondary 按钮、Input、Tab 激活项、Switch 滑块 |
| `shadow-sm` | 静息卡片、画布节点 |
| `shadow-md` | hover 抬升的卡片、选中节点、Tooltip |
| `shadow-lg` | Popover / Dropdown / Select / Toast / 画布浮层 |
| `shadow-xl` | Dialog / Sheet / AlertDialog / Command |

`shadow-2xl`、`shadow-node`、`shadow-node-selected`、`shadow-panel`、`shadow-popover` 已不存在。禁止 `shadow-[...]`。

---

## 5. 动效

| 场景 | 写法 |
|---|---|
| 颜色变化 | `transition-colors duration-150` |
| 抬升 / 位移 | `transition-[transform,box-shadow,border-color] duration-200 ease-out-expo` |
| 布局宽度 | `transition-[width] duration-300 ease-out-expo` |

- `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)`，与 `shared/lib/motion.ts` 的 `EASE` 同值。
- **禁止 `transition-all`** —— 必须列出具体属性。
- `hover:-translate-y-0.5` 只允许出现在 `shared/ui/card.tsx` 的 `interactive` 变体；业务层要抬升就用 `<Card interactive>`。
- 按钮微交互只有 `active:scale-[0.98]`，无 hover 缩放。
- JS 动画参数只能取自 `shared/lib/motion.ts`（`DUR` / `EASE` / `fadeIn` / `scaleIn` / `panelSlide*` / `staggerList`）。
- **禁止 `animate-in` / `animate-out` / `fade-in-0` / `zoom-in-95` / `slide-*`**：`tailwindcss-animate` 未安装，这些类从未生效。进退场动画一律用 `motion/react` + `AnimatePresence`。
- `prefers-reduced-motion` 降级集中在 `index.css` 末尾唯一一处；JS 动画由 `app/providers.tsx` 的 `<MotionConfig reducedMotion="user">` 自动降级。

---

## 6. 层级（z-index）

| 层 | 用途 |
|---|---|
| `z-10` | 页内 sticky 头 |
| `z-20` | 画布内叠层：minimap、状态栏、edge badge |
| `z-30` | 画布浮动面板 / 工具条 / palette 浮层 |
| `z-40` | 画布右键菜单 / 节点信息卡 |
| `z-50` | 所有 portal 浮层：Dialog / Sheet / AlertDialog / Popover / Dropdown / Select / Tooltip / Toast / Command |

禁止 `z-[...]`。

---

## 7. 字号与图标

| 层级 | 写法 |
|---|---|
| 页面标题 | 只由 `PageHeader`（`text-xl font-semibold tracking-tight`）/ `WorkbenchHeader`（`text-sm font-semibold`）产生 |
| 区块标题 | `text-base font-semibold` |
| 卡片标题 | `text-sm font-semibold`（`CardTitle`） |
| 正文 | `text-sm` |
| meta | `text-xs text-muted-foreground` |
| 微标签 | `text-2xs`（11px） |

禁止 `text-[10px]` / `text-[11px]`，禁止 features 内 `<h1>`。

lucide 图标新代码用 `className`，不用 `size={N}` prop（存量不迁移）：

| 尺寸 | 场景 |
|---|---|
| `size-3.5` | xs 按钮、Badge 内 |
| `size-4` | 按钮 / 菜单项 / 输入框内（`Button` 已按 size 自动定尺寸，无需再写） |
| `size-5` | PageHeader 图标芯片、EmptyState |
| `size-[18px]` | 导航项 |

---

## 8. 焦点、遮罩、模糊

- 焦点环统一 `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`；输入类控件额外 `focus-visible:border-primary`。
- 遮罩只有一种：`shared/ui/overlay.ts` 的 `OVERLAY_CLASS`（`fixed inset-0 z-50 bg-black/50 backdrop-blur-xs`）。
- `backdrop-blur` 白名单只有两处：`shared/ui/overlay.ts` 的 `OVERLAY_CLASS`、`features/canvas/components/canvasChrome.ts` 的 `CANVAS_FLOATING_CLASS`。业务层一律不写。

---

## 9. 尺寸 token

| token | 值 | 用途 |
|---|---|---|
| `--spacing-sidebar` | 240px | 主侧栏展开宽 |
| `--spacing-sidebar-collapsed` | 64px | 主侧栏图标列宽 |
| `--spacing-settings-nav` | 224px | 设置区二级导航宽 |
| `--spacing-palette-expanded` / `-collapsed` | 220 / 52px | 画布 palette |
| `--spacing-property-panel` | 360px | 属性面板默认宽 |
| `--spacing-mapping-panel` | 320px | 字段映射面板 |

用法统一 `w-[var(--spacing-sidebar)]`，不要内联 `style={{ width }}`（JS 可调宽度的面板除外）。

---

## 10. 原语选型

原语都在 `@/shared/ui/<name>`，深路径导入（无 barrel）。

### Button

| variant | 用途 |
|---|---|
| `default` | 主操作 |
| `secondary` | 次级操作（`bg-muted` 实底） |
| `outline` | 次级操作（描边，落在 `surface` 上） |
| `ghost` | 图标按钮、菜单式按钮、低权重操作 |
| `destructive` | 破坏性操作 |
| `link` | 行内文字链接式按钮 |

| size | 高度 | 用途 |
|---|---|---|
| `xs` / `icon-xs` | 28px | 密集区（列表行内、节点内、面板工具位） |
| `sm` / `icon-sm` | 32px | 卡片头、面板头、弹窗关闭 |
| `default` / `icon` | 36px | 常规表单与页面操作 |
| `lg` | 40px | 页面主操作、空态 CTA |

原生控件迁移映射：图标按钮 `rounded p-0.5|p-1` → `variant="ghost" size="icon-xs"`；有 `bg-primary` → `default`；有 `border` → `outline`；仅文字 + hover 底 → `ghost`；删除类 hover → `variant="ghost" className="hover:bg-error/10 hover:text-error"`；一组互斥 tab 形按钮 → `Tabs`；自制下拉 → `Popover`+`Command`（可搜索）/ `DropdownMenu`（纯菜单）/ `Select`（表单值）。

### Card vs well

| 形态 | 写法 |
|---|---|
| 独立卡片（`border` + `bg-surface`） | `<Card>` + `CardHeader/CardTitle/CardDescription/CardContent/CardFooter` |
| 紧凑卡片 | `<Card className="space-y-2 p-3">` |
| 可点击卡片 | `<Card interactive>`（hover 抬升 + 焦点环；不要自己写 `hover:-translate-y`） |
| well（卡片内的内嵌区块） | `<div className="rounded-lg border border-border bg-muted p-3">`，占位/待填用 `border-dashed` |

### StatusBadge

feature 内不得自建 `*StatusBadge` / `StatusDot`。业务枚举先映射到 `StatusTone`，再渲染 `@/shared/ui/status-badge`：

| tone | Badge variant | 圆点 | 语义 |
|---|---|---|---|
| `neutral` | `secondary` | `bg-muted-foreground` | 未开始、草稿、已归档 |
| `primary` | `default` | `bg-primary` | 进行中的中性态、当前选中 |
| `success` | `success` | `bg-success` | 成功、已启用、健康 |
| `warning` | `warning` | `bg-warning` | 降级、待处理、即将过期 |
| `error` | `error` | `bg-error` | 失败、已禁用、超限 |
| `info` | `info` | `bg-info` | 排队中、信息提示 |

运行中状态加 `pulse`。类别芯片（非状态）继续用 `<Badge tone="var(--color-node-*)">`，不要改成 StatusBadge。

### 浮层

| 需求 | 原语 |
|---|---|
| 模态表单 / 确认信息 | `Dialog` + `DialogContent size="sm\|md\|lg\|xl"` |
| 侧边 / 底部抽屉 | `Sheet` + `SheetContent side="right\|left\|bottom"` |
| 破坏性操作确认 | `AlertDialog`（`Action`/`Cancel` 已复用 `buttonVariants`） |
| 轻量浮层（表单片段、筛选器） | `Popover` |
| 操作菜单 | `DropdownMenu` |
| 可搜索列表 | `Command` / `CommandDialog` |
| 悬浮提示 | `Tooltip` / `TooltipHint` |

`Dialog`/`Sheet`/`AlertDialog` 自带遮罩、关闭按钮与进退场动画，不要再手写。
**注意**：`AlertDialog` 关闭后的卸载是异步的（退场动画），断言「关闭」的测试必须用 `waitFor`。

---

## 11. 页面骨架

| 页面类型 | 骨架 |
|---|---|
| 文档型（列表页、详情页、设置表单页） | `<PageContainer>` + `<PageHeader>` |
| 工作台型（画布、会话、执行调试、只读查看器） | `<WorkbenchHeader>` + 不滚动的主体 |

`PageContainer`（`@/shared/components/page-container`）自带 `mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8` 与宽度上限：

| width | 上限 | 用途 |
|---|---|---|
| `default` | `max-w-7xl` | 列表页、仪表盘 |
| `narrow` | `max-w-4xl` | 设置区表单页 |
| `full` | 无 | 需要贴边的特殊页 |

规则：

- 页面滚动由 `app/routes/__root.tsx` 的内容容器负责。页面**不得**自带 `h-full` / `overflow-y-auto` / `p-6` / `mx-auto max-w-*`。
- **同一页面的 loading / error / empty 分支必须用同一个 `PageContainer`**，否则状态切换时布局跳动。
- 空态一律 `<EmptyState icon title description? action? tone?>`，不要手写虚线框。

---

## 12. 画布浮层

从 `@/features/canvas` barrel 导入（canvas 内部用 `../canvasChrome` 相对路径）：

| 常量 | 用途 |
|---|---|
| `CANVAS_FLOATING_CLASS` | 画布上所有浮层：工具条、状态栏、属性面板、右键菜单、节点信息卡、浮动 palette、胶囊按钮 |
| `CANVAS_PANEL_HEADER_CLASS` | 画布侧面板头部行 |

`features/canvas/components/paletteChrome.tsx` 的 `PALETTE_SHELL_CLASS` 是**流内列**（`border-r bg-surface`，无圆角），不是浮层，保持原样。

`features/canvas/components/nodes/**` 与 `features/canvas/components/node/**` 豁免「禁止原生 `<button>`」（节点是高密度自定义渲染），但 className 仍必须只用 token。

---

## 13. 新增页面的检查清单

1. 文档型？→ `PageContainer` + `PageHeader`。工作台型？→ `WorkbenchHeader`。
2. loading / error / empty 与正常态同壳。
3. 卡片用 `<Card>`，内嵌区块用 well，空态用 `EmptyState`。
4. 所有按钮/输入/下拉/弹窗走 `shared/ui`；没有合适原语时**先加原语**，不要在 feature 内自建。
5. 状态用 `StatusBadge` + `StatusTone` 映射表。
6. 颜色只用语义 token；圆角/阴影只用上面的档位；`z-index` 只用阶梯值。
7. 新设置页要同步补 `SettingsLayout` 的 `SETTINGS_GROUPS` 入口，并把路由挂在 `settingsLayoutRoute` 下（有测试守着这两点）。
8. `pnpm lint` 零 error —— 守卫会拦下上面每一条。
