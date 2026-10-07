---
docType: howto
---

# 创建 Agent

本页说明如何新建一个 Agent、为它连接模型和能力，并发布。前提：已有一份 LLM 模型配置，或手头有一个 LLM 服务商的 API Key 用于创建配置。

## 新建 Agent 并选择运行形态

1. 在侧边栏「构建」组点击「Agent」，点击页面右上角的「新建」。
2. 在「新建 Agent」对话框中填写「名称」（留空则为「未命名智能体」）与可选的「描述」，选择「运行形态」：
   - 「有沙箱」（默认）：支持工作区、终端和内置文件工具，可调用有沙箱或无沙箱子 Agent。需要部署启用沙箱运行时。
   - 「无沙箱」：不提供内置文件/终端工具，仅支持 HTTP MCP，适合纯推理与资源编排。
3. 点击「创建」。

页面跳转到 `/agents/:agentId` 的 Agent 画布。画布上已有 Agent Main 节点；选择「有沙箱」时还会自动放置一个 Sandbox 节点。运行形态创建后固定，Agent Main 配置面板的「运行形态」区域只显示当前值。

运行形态对应服务端的 `sandbox` / `no_sandbox`。两者的差别：

| | 有沙箱 | 无沙箱 |
| --- | --- | --- |
| 内置文件读写、编辑、终端工具 | 有，可在 Agent Main 的「原生工具」中逐项开关 | 无 |
| 画布上的 Sandbox、Workspace 节点 | 可用 | 不可用，Agent Main 没有「沙箱」端口 |
| 调用子 Agent | 可调用有沙箱或无沙箱子 Agent | 只能调用无沙箱子 Agent；调用有沙箱子 Agent 时运行失败，错误为 `无 sandbox Agent 不支持调用有 sandbox 的子 Agent` |
| 技能的加载方式 | 技能文件写入沙箱会话目录，Agent 用内置的 `skill` 工具按需加载 | 技能内容写入系统提示词；技能正文合计超过 50 KiB 时只写摘要，Agent 通过 `load_skill` 工具按需加载 |
| 定制运行时 | 可用 Harness 节点挂载 runtime 插件、写 profile patch | 不可用 |

## 连接模型与系统提示词

1. 从节点面板「模型」分组把「LLM 模型」拖到画布上，在配置面板中「选择已有配置」，或在「创建新配置」中选择 Provider、模型并填写 API Key 后点击「保存并应用新配置」。
2. 把 LLM 模型的「模型」端口连到 Agent Main 的「模型」端口。需要在多个模型间按策略选择时，改用 [智能路由](/guide/nodes/smart-routing)。
3. 从「提示」分组把「Text」拖到画布上，写入系统提示词，把它的「文本」端口连到 Agent Main 的「系统提示词」端口。

## 添加能力

把下列节点从面板拖入并连到 Agent Main 对应端口（各节点的配置见节点页）：

| 能力 | 面板分组与节点 | Agent Main 端口 |
| --- | --- | --- |
| 外部工具 | 工具：[MCP Tool](/guide/nodes/mcp-tool)（无沙箱 Agent 仅支持 HTTP MCP） | 工具 |
| 文档检索 | 知识：[Knowledge Base](/guide/nodes/knowledge-base) | 知识库 |
| 长期记忆 | 记忆：[Memory](/guide/nodes/memory) | 记忆 |
| 技能 | 高级：[Skill](/guide/nodes/skill) | Skills |
| 子 Agent | 高级：子 Agent（选择一个已发布的 Agent、版本，填写别名） | 子 Agent |
| 输入预处理 | 高级：[输入预处理器](/guide/nodes/input-preprocessor) | 输入预处理 |
| 沙箱与工作区 | 环境：[Sandbox](/guide/nodes/sandbox)、[Workspace](/guide/nodes/workspace)（仅有沙箱 Agent） | 沙箱 |
| 运行时定制 | 运行时：[Harness 与 Runtime 插件](/guide/agents/harness)（仅有沙箱 Agent） | Harness |

点击 Agent Main 可设置：

- 「原生工具」（仅有沙箱 Agent）：「文件读取」「文件写入」「文本编辑」「终端执行」。
- 「自进化」：「启用自进化」后 Agent 才能使用自进化内置 Skill 和 orchestration 接口；可分别允许「资源管理」「外部编辑」「沙箱管理」。

## 保存与发布

1. 点击工具栏「保存画布」保存当前编辑。需要一个可回看的保存点时点击「保存版本」，可填写「版本标签」，提示「版本已保存」。
2. 点击「发布」，在「发布 Agent」对话框中可选填写「发布标签」「发布说明」，在「发布来源」中选择「当前编辑稿」或「选择已有记录」，点击「发布」。

提示「发布成功」，状态徽章变为「已发布」。之后对话、工作流和 API 调用都使用已发布的版本；「历史记录」中可以查看并发布历史版本。

## 下一步

- [与 Agent 对话](/guide/agents/conversations)
- [在工作流中使用 Agent](/guide/agents/in-workflows)
- [用 Harness 定制 Agent 运行时](/guide/agents/harness)
- [通过 API 调用 Agent](/guide/agents/api-access)
