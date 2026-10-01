---
docType: howto
---

# 文档分析

本页搭建一个从一组文档中提取结构化结论的工作流：Agent 检索知识库中的文档，按给定的 JSON Schema 输出分析结果，并按 Cron 计划定期运行。

## 前提

- 满足[用例](/guide/use-cases/)页列出的共同前提。
- 待分析的文档，格式为 PDF、TXT、Markdown 或 DOCX。

## 1. 建立文档知识库

按[创建知识库](/guide/knowledge-base/creating)新建一个知识库（例如「产品反馈」）并上传文档。

所有文档状态变为「已就绪」后再继续。分析需要覆盖较多片段时，在[检索配置](/guide/knowledge-base/retrieval)中调大检索条数。

## 2. 创建分析 Agent

按[创建 Agent](/guide/agents/creating)新建 Agent，「运行形态」选「无沙箱」。在 Agent 画布上：

1. 连接一个「LLM 模型」到 Agent Main 的「模型」端口。
2. 添加一个「Text」节点连到「系统提示词」端口，写入分析要求，例如：

   ```text
   你是数据分析师。先用知识库检索与任务相关的文档片段，再基于检索结果作答。
   只使用检索到的内容，不要补充文档中没有的事实。
   ```

3. 从「知识」分组添加知识库节点，选择第 1 步的知识库，连到 Agent Main 的「知识库」端口。
4. 发布 Agent。

## 3. 搭建工作流

新建工作流，添加并连接以下节点：

| 节点 | 配置 | 连线 |
| --- | --- | --- |
| Manual Trigger | 默认 | 执行流出口（无名称端口）→ Agent 执行流入口 |
| Text（命名为「分析任务」） | 写入本次分析任务，见下方示例 | 「文本」→ Agent「文本」 |
| Text（命名为「输出 Schema」） | 写入 JSON Schema，见下方示例 | 「文本」→ Agent「Schema」 |
| Agent | 「选择 Agent」选第 2 步发布的 Agent | 「回复」→ Text Output「文本」 |
| Text Output | 无 | — |

「分析任务」示例：

```text
分析文档中用户反馈的主要问题：按问题类型分类，判断整体情绪倾向，给出改进建议。
```

「输出 Schema」示例：

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "categories": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "details": { "type": "string" }
        },
        "required": ["name", "details"]
      }
    },
    "sentiment": { "type": "string", "enum": ["positive", "neutral", "negative"] },
    "recommendations": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["summary", "categories", "sentiment", "recommendations"]
}
```

「Schema」端口收到的 JSON Schema 会追加到 Agent 本次运行的系统提示词中，要求回复为符合该 Schema 的 JSON，所以 Agent 的「回复」就是 JSON 文本。Text 节点的「文本」连到「Schema」端口时，画布按 `text` → `json` 的转换规则允许这条连线，服务端把文本解析为 JSON Schema；文本不是合法的 JSON 对象时，Schema 被忽略。

把结果接到 Text Output 而不是 Agent 的「结构化」端口：「结构化」端口输出的是 Agent 的决策事件内容，不是按 Schema 生成的 JSON（见文末「已知限制」）。

## 4. 运行并查看结果

1. 点击工具栏「运行」。工作流没有输入参数时，对话框提示「当前工作流没有需要填写的字段，确认后将直接启动执行。」，点击「运行」。
2. 底部状态栏变为「已完成」后，点击 Text Output 节点，在「输出」标签中查看 JSON 结果。

要分析不同的问题，修改「分析任务」节点的文本后再运行。需要每次运行时临时输入任务时，改用[输入参数](/guide/workflows/input-parameters)，再用[输入预处理器](/guide/nodes/input-preprocessor)取出字段连到 Agent 的「文本」端口。

## 5. 按计划自动运行

1. 在工具栏点击「发布」并完成发布，面板显示「工作流已成功发布」。
2. 点击工具栏「触发器」→「新增触发器」，类型选「Cron 定时器」，填写「触发器名称」与 5 段「Cron 表达式」，例如每周一 9:00 运行：

   ```text
   0 9 * * 1
   ```

3. 选择「时区」，确认「执行预览」中的时间符合预期，点击「创建触发器」。

触发器卡片显示「下次执行」时间。每次运行的结果在工作流「查看执行记录」中查看。Cron 触发的其他选项见[定时触发](/guide/triggers/cron)。

## 已知限制

- Agent 节点的「结构化」端口读取的是运行结果中的决策字段（`agentloom-server/src/modules/execution/node-output-port.util.ts`），只在 Agent 产生决策事件时有值，不承载按 Schema 生成的 JSON。
- 画布上 `text` 与 `json` 之间的「转换」连线不会在服务端做格式转换，下游节点收到的是原值。例如 Agent「回复」连到 JSON Output 时，JSON Output 收到的是字符串，会被包装为 `{ "value": "<回复文本>" }`。

## 相关

- [知识库](/guide/knowledge-base/)
- [Agent 节点](/guide/nodes/agent)
- [Text Output](/guide/nodes/text-output)
