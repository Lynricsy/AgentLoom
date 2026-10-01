<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts` 的 `NODE_TYPES` / `NODE_TYPE_REGISTRY`；分类名取自 `nodeCategories.ts` 的 `NODE_CATEGORIES`。「节点面板可见」为否的类型只由画布动态创建（如循环体内部节点、可复用块、插件节点）。

| 类型 | 名称 | 分类 | 说明 | 节点面板可见 |
| --- | --- | --- | --- | --- |
| `llm-model` | LLM 模型 | Agent | 配置 LLM provider 和模型参数，通过连线为 Agent 提供模型能力 | 是 |
| `http-tool` | HTTP Request | Tool | HTTP 请求工具 | 是 |
| `code-tool` | Code Executor | Tool | 代码执行工具 | 是 |
| `mcp-tool` | MCP Tool | Tool | MCP 工具节点 | 是 |
| `sandbox` | Sandbox | Tool | 代码执行沙箱环境 | 是 |
| `manual-trigger` | Manual Trigger | Trigger | 手动触发器 | 是 |
| `schedule-trigger` | Schedule | Trigger | 定时触发器 | 是 |
| `webhook-trigger` | Webhook | Trigger | Webhook 触发器 | 是 |
| `api-event-trigger` | API Event | Trigger | API 事件触发器 | 是 |
| `knowledge-base` | Knowledge Base | Knowledge | 知识库检索节点 | 是 |
| `text` | Text | Output | 提供可复用的文本常量，可连接到系统提示词或任意文本输入端口 | 是 |
| `text-output` | Text Output | Output | 文本输出节点 | 是 |
| `json-output` | JSON Output | Output | JSON 输出节点 | 是 |
| `condition` | Condition | Control | 条件分支节点 | 是 |
| `loop` | Loop | Control | 循环 compound 容器 | 是 |
| `iteration` | Iteration | Control | 数组迭代 compound 容器 | 是 |
| `loop-start` | 循环起点 | Control | 循环子图入口节点 | 否 |
| `iteration-start` | 迭代起点 | Control | 迭代子图入口节点 | 否 |
| `loop-state` | Loop State | Control | 提交下一轮循环状态 | 否 |
| `result` | Result | Control | 向父 compound 显式提交结果 | 否 |
| `break` | Break | Control | 结束整个 compound | 否 |
| `continue` | Continue | Control | 跳过当前轮次并进入下一轮 | 否 |
| `reusable-block` | Reusable Block | Control | A reusable group of nodes encapsulated as a single block | 否 |
| `smart-routing` | 智能路由 | Agent | 根据策略从多个 LLM 模型中选择最优模型 | 是 |
| `plugin` | 插件节点 | Plugin | 通过插件扩展的自定义节点 | 否 |
| `input-preprocessor` | 输入预处理器 | Tool | 对输入数据进行转换预处理（JMESPath / JSONata / 模板 / 脚本） | 是 |
| `memory` | Memory | Memory | 图谱记忆实例节点 | 是 |
| `agent` | Agent | Agent | 调用已发布的 Agent Definition 执行任务 | 是 |
| `skill` | Skill | Agent | Agent prompt 增强指令 | 是 |
| `workspace` | Workspace | Tool | 持久化工作区卷 | 是 |
| `merge` | Merge | Control | 合并多分支数据 | 是 |
