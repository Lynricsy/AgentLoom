<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `agent`，分类 Agent。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后触发 Agent 执行 |
| `text-in` | 文本 | `text` | 是 |  | 发送给 Agent 的输入文本，通常来自上游节点或触发数据 |
| `system-prompt-in` | 系统提示词 | `text` |  |  | 覆盖被调用 Agent 的系统提示词，用于为本次工作流调用注入局部角色约束 |
| `sandbox-in` | 沙箱 | `sandbox` |  |  | 绑定沙箱执行环境，Agent 可在其中运行代码和终端命令 |
| `context-in` | 上下文 | `json` |  |  | 传入附加上下文 JSON 数据，Agent 推理时可作为参考信息 |
| `skills-in` | Skills | `skill` |  | 不限 | 启用 Skill 能力模板，Agent 在对话中可按需激活使用 |
| `tools-in` | 扩展工具 | `tool` |  | 不限 | 额外挂载 MCP 工具，Agent 可在对话中按需调用这些工具 |
| `sub-agents-in` | 子 Agent | `agent` |  | 不限 | 注册可调度的子 Agent，主 Agent 可将子任务委派给它们 |
| `schema-in` | Schema | `json` |  |  | 定义 Agent 输出的 JSON Schema，约束回复格式为结构化数据 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，Agent 完成后触发下游节点 |
| `agent-out` | 回复 | `text` |  | 不限 | Agent 生成的自然语言文本回复 |
| `structured-out` | 结构化 | `json` |  | 不限 | Agent 按 Schema 约束输出的结构化 JSON 数据 |

**配置项**

无静态配置项。
