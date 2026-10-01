---
docType: howto
---

# 代码审查

本页搭建一个 GitHub Pull Request 事件触发的审查工作流：GitHub 把 PR 事件 POST 到 Webhook 地址，一个带沙箱、加载了内置技能 code-review 的 Agent 下载 diff 并写出审查意见。

## 前提

- 满足[用例](/guide/use-cases/)页列出的共同前提，包括部署启用了沙箱运行时。
- 对一个**公开** GitHub 仓库有管理员权限，能配置 Webhook。Agent 通过 PR 事件中的 `diff_url` 下载 diff；私有仓库的 diff 需要额外的访问凭据，本页不涉及。
- AgentLoom 的 Webhook 地址能从公网访问。

## 1. 创建审查 Agent

按[创建 Agent](/guide/agents/creating)新建 Agent，「运行形态」保持默认的「有沙箱」，Agent 才能用终端下载 diff。在 Agent 画布上：

1. 连接一个「LLM 模型」到 Agent Main 的「模型」端口。
2. 添加一个「Text」节点连到「系统提示词」端口，例如：

   ```text
   你是代码审查员。输入的上下文是一个 GitHub pull_request 事件。
   1. 如果 action 不是 opened 或 synchronize，只回复“跳过：<action>”。
   2. 否则在终端执行 curl -sL <pull_request.diff_url> 下载 diff。
   3. 按严重问题、一般问题、优化建议三类列出发现，每条写明文件、位置与修改建议。
   4. 最后给出是否建议合并的结论。
   ```

3. 从「高级」分组添加「Skill」节点，在面板的「搜索 Skill...」中选择内置技能 `code-review`，把它连到 Agent Main 的「Skills」端口。内置技能的内容见[内置技能](/guide/skills/built-in)。
4. 在 Agent Main 的「原生工具」中确认「终端执行」已开启。
5. 发布 Agent。

技能挂在 Agent 画布上，而不是工作流画布：这样无论在哪里调用这个 Agent 都会带上它。所选技能后来被删除或停用时，Skill 面板会提示并把节点标为配置错误；运行时节点不会失败，只在输出中带 `warning` 字段，见 [Skill 节点](/guide/nodes/skill)。

沙箱默认不能访问私有网段，访问 `github.com` 这类公网地址不受影响。需要访问内网 Git 服务时，由部署方配置 `FIRECRACKER_EGRESS_ALLOWED_PRIVATE_CIDRS`，见 [Firecracker 沙箱](/deploy/firecracker)。

## 2. 搭建工作流

新建工作流，添加并连接以下节点：

| 节点 | 配置 | 连线 |
| --- | --- | --- |
| Webhook | 默认 | 「触发数据」→ Agent「上下文」 |
| Text | 写入「审查这个 Pull Request。」 | 「文本」→ Agent「文本」 |
| Sandbox | 「生命周期模式」选「临时」，资源保持默认 | 「沙箱」→ Agent「沙箱」 |
| Agent | 「选择 Agent」选第 1 步发布的 Agent | 「回复」→ Text Output「文本」 |
| Text Output | 无 | — |

Agent 收到的输入是「文本」端口的内容，后面附上其余输入端口（包括「上下文」中的整个 PR 事件）的 JSON。

## 3. 发布并创建 Webhook 触发器

1. 在工具栏点击「发布」并完成发布，面板显示「工作流已成功发布」。
2. 点击工具栏「触发器」→「新增触发器」，类型选「Webhook」，填写「触发器名称」。
3. 验证模式选「GitHub：校验 GitHub 的 X-Hub-Signature-256 签名」，点击「创建触发器」。
4. 在「保存 Webhook 凭证」中复制 Webhook URL 与 Secret（Secret 只显示这一次），点击「完成」。

GitHub 模式用触发器的 Secret 校验 GitHub 发送的 `X-Hub-Signature-256`，同一投递只启动一次执行，见 [接入 GitHub 仓库](/guide/triggers/webhook#接入-github-仓库)。需要进一步限制来源时，在「IP 白名单」中填入 GitHub 公布的 Webhook 出口网段。

## 4. 在 GitHub 配置 Webhook

在仓库的 **Settings → Webhooks → Add webhook** 中：

- **Payload URL**：Webhook URL。
- **Content type**：`application/json`。请求体的顶层字段会成为本次执行的输入参数，`application/x-www-form-urlencoded` 格式下 PR 事件不会以 JSON 对象传入。
- **Secret**：触发器的 Secret。
- **Which events**：选 **Let me select individual events**，只勾选 **Pull requests**。

保存后 GitHub 立即发送一次 `ping` 事件。AgentLoom 校验签名后返回 200、不启动执行，触发历史记录一条「跳过」；GitHub 的 **Recent Deliveries** 中该次投递的响应码为 200。

## 5. 触发并查看结果

在仓库中新建一个 Pull Request。

GitHub 投递 `pull_request` 事件（`action` 为 `opened`），工作流「查看执行记录」中出现一条新执行。点击进入执行调试页，选中 Agent 节点后点击「打开 Agent 运行视图」，可以看到 Agent 执行 `curl` 下载 diff 的终端输出与审查过程；审查意见在 Text Output 节点的输出中。

同一个 PR 的每次推送（`synchronize`）、关闭（`closed`）等动作都会再触发一次执行，每次都会启动一个沙箱。

## 相关

- [Webhook 触发](/guide/triggers/webhook)
- [Sandbox 节点](/guide/nodes/sandbox)
- [调试工作流](/guide/workflows/debugging)
