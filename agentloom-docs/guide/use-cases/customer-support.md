---
docType: howto
---

# 智能客服

本页搭建一个按 FAQ 文档回答问题的工作流：外部客服系统把用户问题 POST 到 Webhook 地址，工作流调用一个绑定了知识库的 Agent 生成回答。

::: warning 未在本轮验证
第 5 步的 `curl` 命令没有对运行中的服务实跑，响应格式以 [Webhook 与 API 事件](/api/webhooks) 为准。
:::

## 前提

- 满足[用例](/guide/use-cases/)页列出的共同前提。
- 一份 FAQ 文档，格式为 PDF、TXT、Markdown 或 DOCX。

## 1. 把 FAQ 放进知识库

按[创建知识库](/guide/knowledge-base/creating)新建一个知识库（例如「产品 FAQ」）并上传文档。

文档状态变为「已就绪」后再继续。检索条数等参数在[检索配置](/guide/knowledge-base/retrieval)中调整。

## 2. 创建客服 Agent

按[创建 Agent](/guide/agents/creating)新建 Agent，「运行形态」选「无沙箱」（客服回答不需要终端与文件工具）。在 Agent 画布上：

1. 连接一个「LLM 模型」到 Agent Main 的「模型」端口。
2. 添加一个「Text」节点，连到 Agent Main 的「系统提示词」端口，写入角色约束，例如：

   ```text
   你是产品客服。只根据知识库中检索到的内容回答用户问题。
   知识库没有相关内容时，回答“这个问题我暂时无法回答，请联系人工客服”，不要编造。
   回答使用简洁、礼貌的中文。
   ```

3. 从「知识」分组添加知识库节点，「选择知识库」选第 1 步的知识库，把它的「知识库」端口连到 Agent Main 的「知识库」端口。
4. 发布 Agent。

提示「发布成功」，状态徽章变为「已发布」。工作流只能选择已发布的 Agent，知识库随 Agent 的发布版本生效。

## 3. 搭建工作流

按[创建工作流](/guide/workflows/creating)新建工作流，添加并连接以下节点：

| 节点 | 配置 | 连线 |
| --- | --- | --- |
| Webhook | 默认 | 「触发数据」→ 输入预处理器「JSON」 |
| 输入预处理器 | 「转换类型」选「模板」，「转换表达式」见下方 | 「文本」→ Agent「文本」 |
| Agent | 「选择 Agent」选第 2 步发布的 Agent | 「回复」→ Text Output「文本」 |
| Text Output | 无 | — |

转换表达式：

```text
{{json-in.question}}
```

输入预处理器的表达式以输入端口 ID 为根，`json-in.question` 取出触发数据中的 `question` 字段，作为交给 Agent 的问题文本，见[输入预处理器](/guide/nodes/input-preprocessor)。

然后在工具栏「输入参数」中添加一个「字段 ID」为 `question`、「字段类型」为文本的必填字段，点击「保存输入参数」，提示「输入参数已保存」。这个字段让手动运行时也能填写问题，见[输入参数](/guide/workflows/input-parameters)。

## 4. 手动运行验证

1. 点击工具栏「运行」，在「启动工作流」对话框中填写 `question`，例如「你们的退货政策是什么？」，点击「运行」。
2. 底部状态栏变为「已完成」后，点击 Text Output 节点，在配置面板的「输出」标签中查看回答。

回答没有用到 FAQ 内容时，依次检查：文档状态是否为「已就绪」；知识库节点是否连到了 Agent Main 的「知识库」端口；工作流中的 Agent 节点是否选择了包含该连线的发布版本。执行过程见[运行与监控](/guide/workflows/running)。

## 5. 开放 Webhook 入口

1. 在工具栏点击「发布」，在「发布工作流」面板中点击「发布」，面板显示「工作流已成功发布」。
2. 点击工具栏「触发器」，在「触发器管理」中点击「新增触发器」，类型选「Webhook」，填写「触发器名称」，鉴权方式保持「Simple：仅校验 Token 与 IP 白名单」，点击「创建触发器」。
3. 对话框显示 Token 与 secret，按提示保存；触发器卡片的「Webhook 入口」是外部系统要调用的 URL。

外部系统按以下方式调用（`WEBHOOK_URL` 为「Webhook 入口」的完整 URL）：

```bash
curl -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{"question": "你们支持哪些付款方式？"}'
```

服务端返回 HTTP 202，响应中包含本次执行的 `executionId`，此时回答尚未生成。请求体的顶层字段就是本次执行的输入参数，所以 `question` 与手动运行时填写的字段同名。

Webhook 调用不会同步返回回答。外部系统需要用 `executionId` 通过 [REST API](/api/rest) 查询执行结果；在 Studio 中，结果出现在工作流的「查看执行记录」里。签名模式、IP 白名单与触发历史见 [Webhook 触发](/guide/triggers/webhook)。

## 相关

- [知识库](/guide/knowledge-base/)
- [在工作流中使用 Agent](/guide/agents/in-workflows)
- [Webhook 与 API 事件](/api/webhooks)
