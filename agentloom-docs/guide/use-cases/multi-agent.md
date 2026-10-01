---
docType: howto
---

# 多 Agent 协作

本页搭建一条由三个 Agent 接力完成的管线：需求分析 → 技术方案 → 代码骨架。前一个 Agent 的回复作为后一个 Agent 的输入，三个 Agent 在同一个沙箱中读写文件。

## 前提

- 满足[用例](/guide/use-cases/)页列出的共同前提，包括部署启用了沙箱运行时。

## 两种协作方式

| 方式 | 结构 | 适用 |
| --- | --- | --- |
| 工作流中串联多个 Agent 节点（本页） | 顺序固定，每一步的输入输出在执行记录中可单独查看 | 步骤明确、需要逐步审阅的流程 |
| 在 Agent 画布上挂子 Agent | 主 Agent 运行中自行决定何时把子任务委派给哪个子 Agent | 步骤不固定、由模型拆解任务的场景 |

子 Agent 的接法见[创建 Agent](/guide/agents/creating)的「添加能力」。

## 1. 创建三个 Agent

按[创建 Agent](/guide/agents/creating)创建三个 Agent，「运行形态」都选「有沙箱」，每个都在 Agent 画布上连接「LLM 模型」与一个写系统提示词的「Text」节点，然后发布。

| Agent | 系统提示词要点 |
| --- | --- |
| 需求分析师 | 把输入的产品需求拆成功能点与验收标准；把结果写入沙箱工作目录的 `requirements.md`，并在回复中给出同样的内容 |
| 技术架构师 | 阅读输入与 `requirements.md`，设计模块划分与接口；写入 `architecture.md` 并在回复中给出 |
| 代码生成器 | 阅读 `requirements.md` 与 `architecture.md`，在工作目录下生成代码骨架与 `README.md`；回复中列出生成的文件 |

无沙箱 Agent 不能使用沙箱，也不能调用有沙箱的子 Agent，所以三个 Agent 都选「有沙箱」。

## 2. 搭建工作流

新建工作流，添加并连接以下节点：

| 节点 | 配置 | 连线 |
| --- | --- | --- |
| Manual Trigger | 默认 | 「触发数据」→ 输入预处理器「JSON」 |
| 输入预处理器 | 「转换类型」选「模板」，「转换表达式」见下方 | 「文本」→ 需求分析师「文本」 |
| Sandbox | 「生命周期模式」选「临时」 | 「沙箱」分别连到三个 Agent 节点的「沙箱」端口 |
| Agent（需求分析师） | 选择需求分析师 | 「回复」→ 技术架构师「文本」 |
| Agent（技术架构师） | 选择技术架构师 | 「回复」→ 代码生成器「文本」 |
| Agent（代码生成器） | 选择代码生成器 | 「回复」→ Text Output「文本」 |
| Text Output | 无 | — |

转换表达式：

```text
{{json-in.requirement}}
```

在工具栏「输入参数」中添加一个「字段 ID」为 `requirement` 的必填文本字段并保存，见[输入参数](/guide/workflows/input-parameters)。

执行顺序由数据连线决定：节点在所有输入连线的上游都结束后才执行，所以三个 Agent 依次运行，不需要再连执行流。

## 3. 共享沙箱的行为

三个 Agent 节点的「沙箱」端口连到同一个 Sandbox 节点时，它们在本次执行中使用这个 Sandbox 节点创建的同一个沙箱会话，后运行的 Agent 能读到前面 Agent 写入的文件。没有连接 Sandbox 节点的有沙箱 Agent 各自使用独立的沙箱。

每个有沙箱的 Agent 节点结束（成功或失败）后，沙箱中的文件被保存为一个工作区快照，沙箱会话本身不受影响，后续 Agent 继续使用。Sandbox 节点的「工作区」端口连接了 [Workspace](/guide/nodes/workspace) 节点时，文件改为同步回该工作区，可以在多次执行之间保留。

Sandbox 节点的 Timeout 默认为 `0`（不超时）；资源与生命周期选项见 [Sandbox 节点](/guide/nodes/sandbox)。

## 4. 运行并查看结果

1. 点击工具栏「运行」，在「启动工作流」对话框中填写 `requirement`（一段产品需求描述），点击「运行」。
2. 画布上三个 Agent 节点依次进入执行中，再变为已完成。
3. 底部状态栏变为「已完成」后，在「查看执行记录」中打开本次执行。选中任一 Agent 节点后点击「打开 Agent 运行视图」，可以查看它的完整消息、终端输出与文件变更；最终回复在 Text Output 节点的输出中。

## 5. 按任务为 Agent 选择模型

每个 Agent 使用自己画布上连接的模型，三个 Agent 可以使用不同的模型。需要让一个 Agent 在多个模型之间按策略选择时，在该 Agent 的画布上：

1. 添加两个或更多「LLM 模型」节点，分别连到「智能路由」节点的「模型 1」「模型 2」端口。
2. 在「智能路由」节点中选择「路由策略」。
3. 把「智能路由」的「选定模型」端口连到 Agent Main 的「模型」端口，然后重新发布该 Agent。

工作流中的 Agent 节点默认「使用最新发布版本」，重新发布后下一次执行即生效。路由策略与健康状态见[智能路由](/guide/nodes/smart-routing)。

## 相关

- [在工作流中使用 Agent](/guide/agents/in-workflows)
- [Sandbox 节点](/guide/nodes/sandbox)
- [调试工作流](/guide/workflows/debugging)
