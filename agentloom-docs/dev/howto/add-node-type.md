---
docType: howto
---

# 新增节点类型

要让画布上出现一种新节点、并让工作流运行时能执行它，需要同时改 Studio 的注册表、server 的执行器和用户文档。下文以类型名 `my-node` 为例。

前置条件：本地开发环境可用（[搭建本地开发环境](/dev/setup)）；了解画布如何读取注册表（[画布](/dev/studio/canvas)）与调度如何分派节点（[系统架构](/dev/architecture#一次工作流运行的路径)）。

## 1. 在 Studio 注册表中声明类型

编辑 `agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`：

1. 把 `'my-node'` 加入 `NODE_TYPES`。类型名用 kebab-case，它同时是节点页的文件名。
2. 在 `NODE_TYPE_REGISTRY` 中加一项 `NodeTypeConfig`：`type`、`category`（取 `nodeCategories.ts` 中的分类键）、`label`、`icon`、`description`、`colorToken`、`inputPorts`、`outputPorts`、`configSchema`。端口用 `createPort(id, label, direction, dataType, options)` 构造，配置项用 `createConfigField(type, title, options)`，两者定义在 `agentloom-studio/src/features/canvas/types/portSchema.ts`，注册表文件已导入。可参照 `text` 一项：

```ts
// agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts（NODE_TYPE_REGISTRY 内）
'my-node': {
  type: 'my-node',
  category: 'tool',
  label: 'My Node',
  icon: 'Wrench',
  description: '一句话说明节点做什么',
  colorToken: CATEGORY_COLOR_TOKENS.tool,
  inputPorts: [createPort('input', '输入', 'input', 'json')],
  outputPorts: [createPort('output', '输出', 'output', 'json')],
  configSchema: {
    type: 'object',
    properties: {
      timeoutMs: createConfigField('number', '超时（毫秒）', { default: 30000 }),
    },
    required: [],
  },
},
```

按需把新类型加入两个集合：

- `DYNAMIC_ONLY_NODE_TYPES`：节点只由运行时或其他节点生成（如循环内部节点、插件节点），不在节点面板中出现。
- `EXEC_PORT_NODE_TYPES`：节点需要 `exec` 控制流端口。

端口的 `dataType` 必须是 `agentloom-contracts/src/port-data-type.ts` 中已有的取值；需要新数据类型时先按 [契约与再生成](/dev/contracts) 同步四端。

节点面板的分组来自 `agentloom-studio/src/features/canvas/components/nodeCategories.ts` 的 `NODE_CATEGORIES`，React Flow 按分类渲染（`agentloom-studio/src/features/canvas/components/workflowFlowRegistry.ts`），所以只要 `category` 正确，节点就会出现在对应分组。需要自定义节点主体或配置面板时，分别在 `agentloom-studio/src/features/canvas/components/node/NodeBodyRenderer.tsx` 与 `agentloom-studio/src/features/canvas/components/panels/customPanelRegistry.tsx` 注册；否则使用按 `configSchema` 渲染的通用表单。

验证：

```bash
cd agentloom-studio
pnpm test src/features/canvas/types/nodeTypeRegistry.test.ts
```

`Test Files` 一行全部 `passed`。启动 Studio 后，画布左侧节点面板对应分组中出现「My Node」，拖入后右侧配置面板显示「超时（毫秒）」。

## 2. 在 server 中实现执行器

工作流运行时，`agentloom-server/src/modules/execution/node-dispatcher.service.ts` 按 `step.nodeType` 查表找执行器；查不到时该步骤以「不支持的节点类型」失败。

1. 执行器实现 `agentloom-server/src/modules/execution/node-executors/node-executor.interface.ts` 中的 `NodeExecutor`：一个 `execute(context: NodeExecutionContext)` 方法。`context` 提供执行 id、租户、当前步骤、已解析的输入、图快照与调度器 `runtime`。行为与现有执行器相近时直接复用（例如产出资源引用的类型用 `ResourceNodeExecutor`，同步计算的类型参照 `HttpNodeExecutor`），新建执行器放在 `agentloom-server/src/modules/execution/node-executors/`。
2. 在 `NodeDispatcherService` 构造函数的 `executors` 表中加 `'my-node': <执行器>`。
3. 新执行器类加入 `agentloom-server/src/modules/execution/execution.module.ts` 的 `providers`，并注入 `NodeDispatcherService` 的构造函数。
4. 执行器完成后调用 `context.runtime.onNodeCompleted(...)` 或 `onNodeFailed(...)`，调度才会推进到后继节点（参照现有执行器的写法）。

验证：在 `agentloom-server/src/modules/execution/__tests__/` 中为执行器加单测并运行：

```bash
cd agentloom-server
pnpm test src/modules/execution
```

在 Studio 中搭一个「Manual Trigger → My Node → Text Output」的工作流并运行，执行详情中 `my-node` 步骤进入 `completed`。

## 3. 生成参考并写节点页

在仓库根执行：

```bash
pnpm docs:gen
```

`agentloom-docs/_generated/node-types.md` 出现 `my-node` 一行，并新建 `agentloom-docs/_generated/nodes/` 下的 `my-node.md`（端口与配置表）。

新建 `agentloom-docs/guide/nodes/` 下的 `my-node.md`，结构固定：

```markdown
---
docType: reference
---

# My Node

（一段用途说明，取自注册表 description，可扩写）

## 端口与配置

<!--@include: ../../_generated/nodes/my-node.md-->

## 使用要点

（只写能在 executor 代码中证实的行为）

## 相关
```

再把页面登记到 `agentloom-docs/.vitepress/sidebar/guide.ts` 的节点分组（按 `NODE_CATEGORIES` 顺序）。最后：

```bash
pnpm docs:check
```

节点页覆盖检查要求每个 `NODE_TYPES` 值都有承载页面且页面含对应的 `_generated/nodes/<type>.md` include；通过时退出码为 0。触发器类、循环内部类与迭代起点类型分别并入 `trigger.md`、`loop.md`、`iteration.md`，规则见 [文档维护指南](/dev/docs-maintenance)。
