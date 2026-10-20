---
docType: reference
---

# 错误参考

AgentLoom 的 REST API 出错时返回 `application/problem+json`（RFC 9457）响应体，字段为 `type`、`title`、`status`、`detail`、`instance`；请求体校验失败时另有 `errors` 数组，逐项给出 `field` 与 `message`。Studio 中的错误提示通常显示 `title` 或 `detail`。响应格式的完整说明见 [API 概览](/api/)。

本页按功能列出用户最常遇到的 `type`。所有类型都使用公共前缀 `https://agentloom.dev/errors/`，表中省略前缀，例如 `workflow-not-published` 的完整值是 `https://agentloom.dev/errors/workflow-not-published`。

本页没有列全。遇到表中没有的 `type` 时，取前缀之后的部分在 `agentloom-server/src` 中搜索，定义它的异常类（多在各模块的 `*.exceptions.ts` 中）会给出状态码与 `detail` 文案。

工作流节点在执行中失败时，错误显示在节点配置面板的「输出」标签与执行调试页中，不以 problem+json 形式返回，见[调试工作流](/guide/workflows/debugging)。

## 通用

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `validation-error` | 422 | 请求体或参数未通过校验 | 按 `errors` 中每项的 `field` 与 `message` 修正后重试 |
| `http-error` | 随原错误 | 未归类的 HTTP 错误，`detail` 为原始消息 | 按 `status` 与 `detail` 判断 |
| `internal-server-error` | 500 | 未处理的服务端异常 | 记录 `instance` 与发生时间，交给部署管理员查服务端日志 |
| `not-found` | 404 | 路径或查询参数中的资源 ID 不是合法 UUID，资源不可能存在 | 核对链接或请求中的 ID |
| `rate-limit-exceeded` | 429 | 超过每分钟请求上限 | 按响应头 `Retry-After` 等待后重试；`X-RateLimit-*` 头给出上限与剩余次数 |
| `resource-governance-decision-blocked` | 429 或 409 | 被组织的资源治理策略拦截；平台 API Token 超出每分钟调用上限时为 429，其他治理拦截为 409 | 查看 `detail`，联系组织管理员调整配额或策略 |
| `resource-governance-access-denied` | 403 | 资源治理拒绝访问 | 联系组织管理员 |

## 登录与账户

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `token-missing` | 401 | 请求没有携带凭证 | 重新登录；API 调用按 [API 概览](/api/)携带凭证 |
| `token-expired` | 401 | 登录凭证已过期 | 重新登录 |
| `token-revoked` | 401 | 登录凭证已被吊销（已退出或会话被注销） | 重新登录 |
| `token-invalid` | 401 | 登录凭证无法验证 | 重新登录 |
| `invalid-credentials` | 401 | 邮箱或密码错误 | 检查后重试 |
| `email-conflict` | 409 | 邮箱已被注册 | 直接登录，或换一个邮箱注册 |
| `wrong-current-password` | 401 | 修改密码时当前密码不正确 | 重新输入当前密码 |
| `same-password` | 400 | 新密码与当前密码相同 | 换一个新密码 |
| `mfa-required` | 403 | 账户启用了双因素认证，需要先验证 | 输入身份验证器中的 6 位验证码 |
| `mfa-verification-failed` | 401 | 双因素验证码错误 | 使用身份验证器当前显示的验证码重试 |
| `mfa-token-expired` | 401 | 双因素验证流程已过期 | 重新登录 |
| `aal2-required` | 403 | 该操作要求本次登录已完成双因素验证 | 退出后重新登录并完成两步验证 |
| `session-revoke-current` | 400 | 不能在会话列表中注销当前会话 | 使用「退出登录」 |
| `auth-unavailable` | 503 | 认证服务当前不可用 | 稍后重试；持续出现时联系部署管理员 |
| `session-verification-unavailable` | 503 | 服务端暂时无法确认登录会话是否仍有效 | 稍后重试；持续出现时联系部署管理员 |
| `refresh-invalid` | 401 | 刷新凭证无效或已失效 | 重新登录 |
| `session-not-found` | 404 | 要注销的登录会话不存在 | 刷新会话列表 |
| `mfa-enrollment-failed` | 400 | 双因素认证登记失败 | 关闭对话框后重新开始登记 |
| `mfa-factor-not-found` | 404 | 双因素认证因子不存在 | 刷新安全设置页面 |

账户安全设置见[账户安全](/guide/account/security)。

## 组织与权限

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `tenant-required` | 400 | 请求缺少组织上下文 | 先加入或创建组织，再刷新页面 |
| `insufficient-permissions` | 403 | 当前角色不能执行该操作 | 请组织 owner 或 admin 调整角色，见[角色与权限](/guide/collaboration/roles) |
| `insufficient-organization-permission` | 403 | 当前角色不能执行该组织管理操作 | 同上 |
| `sole-owner-constraint` | 409 | 组织必须至少保留一个 owner | 先把另一位成员设为 owner |
| `invitation-expired-or-used` | 410 | 邀请已过期或已被使用 | 请管理员重新邀请 |
| `invitation-email-mismatch` | 403 | 当前登录账号的邮箱与邀请邮箱不一致 | 退出后用受邀邮箱登录，再打开邀请链接 |
| `pending-invitation-exists` | 409 | 已有一份待接受的邀请 | 等待对方接受或撤回原邀请 |
| `already-organization-member` | 409 | 对方已是组织成员 | 无需再次邀请 |
| `organization-not-found` | 404 | 组织不存在或你不是该组织成员 | 确认链接与当前组织 |
| `organization-member-not-found` | 404 | 目标用户不是该组织成员 | 刷新成员列表 |
| `invitation-not-found` | 404 | 邀请不存在 | 请管理员重新邀请 |
| `admin-cannot-invite-owner` | 403 | admin 不能邀请 owner | 请 owner 发出邀请 |
| `admin-cannot-grant-owner` | 403 | 只有 owner 能把成员设为 owner | 请 owner 调整角色 |
| `admin-cannot-remove-owner` | 403 | admin 不能修改或移除 owner | 请 owner 操作 |
| `notification-not-found` | 404 | 通知不存在或不属于当前用户 | 刷新通知列表 |
| `tenant-key-not-found` | 404 | 组织加密密钥不存在 | 刷新密钥列表 |
| `tenant-key-invalid` | 400 | 上传的公钥无效 | 按 `detail` 重新导出公钥 |
| `tenant-key-already-exists` | 409 | 组织已有一把启用中的加密密钥 | 改用轮换替换现有密钥 |
| `tenant-key-fingerprint-conflict` | 409 | 该公钥已在本组织登记过（含已轮换或已撤销的） | 生成新的密钥对 |
| `tenant-key-not-active` | 409 | 只有启用中的密钥可以轮换 | 对当前启用中的密钥执行轮换 |
| `tenant-key-revoked` | 409 | 密钥已撤销 | 无需处理，或上传新密钥 |

## 工作流与执行

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `workflow-not-found` | 404 | 工作流不存在或不属于当前组织 | 确认链接与当前组织 |
| `version-conflict` | 409 | 工作流已被其他用户或其他标签页修改 | 刷新页面后重新编辑 |
| `workflow-archived` | 409 | 工作流已归档，不能编辑、发布或执行 | 使用其他工作流；归档不可撤销 |
| `workflow-not-published` | 409 | 工作流未发布，不能启动执行、创建触发器或分析优化提案（`detail` 写明被拒绝的操作） | 先发布，见[版本管理](/guide/workflows/versions) |
| `workflow-publish-validation` | 422 | 发布前校验未通过（画布结构错误，或连线两端端口数据类型不兼容），`detail` 为第一条原因，`errors` 逐条列出；类型不兼容的连线 `field` 为 `edges.<连线 ID>` | 按 `errors` 修正画布后重新发布 |
| `workflow-publish-agent-binding` | 422 | 工作流中的 Agent 节点未绑定可用的已发布 Agent | 在每个 Agent 节点中重新选择已发布的 Agent |
| `workflow-publish-legacy-llm-agent` | 422 | 工作流包含已废弃的 llm-agent 节点 | 按 `detail` 改用 Agent 节点 |
| `workflow-publish-autonomy-cap` | 422 | 节点配置超出组织自治上限 | 调整节点配置，或请管理员修改[自治策略](/guide/collaboration/autonomy-policy) |
| `workflow-launch-input-invalid` | 422 | 启动参数未通过输入参数校验 | 按 `errors` 修正输入，见[输入参数](/guide/workflows/input-parameters) |
| `workflow-launch-schema-version-mismatch` | 409 | 启动时使用的 `schemaVersion` 与工作流当前的输入参数版本不一致（保存输入参数后版本即加 1，不需要重新发布） | Studio 中刷新页面后重新运行；API 调用先 `GET /workflow-definitions/:id/input-schema` 取最新 `version`，见[启动工作流执行](/api/workflow-runs) |
| `cyclic-graph` | 400 | 工作流图存在环路 | 删除形成环路的连线 |
| `node-type-mismatch` | 422 | 运行时某条连线两端的端口数据类型不兼容；或 JSON 端口连到「数组」端口而上游实际值不是数组（`detail` 写明实际类型） | 按 `detail` 中的节点与端口修改连线，或让上游输出数组 |
| `reusable-block-expansion-failed` | 422 | 运行前展开可复用块失败：块缺少内嵌定义、块端口没有映射到块内节点，或连线连到块上不存在的端口 | 从「My Blocks」重新拖入该块，或删除失效连线后重新发布，见 [Reusable Block](/guide/nodes/reusable-block) |
| `execution-not-found` | 404 | 执行记录不存在 | 确认执行 ID |
| `execution-not-cancellable` | 409 | 执行已结束，不能取消 | 无需处理 |
| `execution-not-resumable` | 409 | 只有失败的执行可以恢复（已取消、已完成、运行中的执行都不能恢复），且所选起点及其下游必须有可重跑的步骤；已暂停的执行需先处理人工干预 | 见[调试工作流 · 从失败处恢复](/guide/workflows/debugging#从失败处恢复) |
| `intervention-not-allowed` | 409 | 该步骤当前不在等待干预状态 | 刷新执行页查看最新状态 |
| `workflow-version-not-found` | 404 | 指定的工作流版本不存在 | 刷新版本列表后重新选择 |
| `workflow-import-model-unavailable` | 422 | 从模板或分享创建工作流时所选模型不可用 | 选择当前组织已启用的模型 |
| `template-not-found` | 404 | 模板不存在 | 刷新模板列表 |
| `execution-resume-node-not-found` | 422 | 恢复执行时指定的起点节点不在该执行的图中 | 从执行页选择图中已有的节点恢复 |
| `execution-resume-node-inside-container` | 422 | 恢复起点是循环/迭代容器内部的节点，不能单独恢复（扩展字段 `containerNodeId` 给出所属顶层容器） | 改为从 `containerNodeId` 指向的容器节点恢复，见[调试工作流 · 从失败处恢复](/guide/workflows/debugging#从失败处恢复) |
| `execution-step-not-found` | 404 | 执行步骤不存在或不属于该执行 | 刷新执行页查看最新步骤 |
| `agent-execution-failed` | 500 | Agent 节点执行失败 | 按 `detail` 检查 Agent 配置与模型连接后重试 |
| `tool-permission-resolution-not-allowed` | 409 | 工具调用当前不在等待审批状态 | 刷新执行页查看最新状态 |
| `dead-letter-job-not-found` | 404 | 死信任务不存在 | 刷新死信列表 |
| `evidence-not-found` | 404 | 证据记录不存在 | 刷新执行证据页 |
| `intervention-policy-not-found` | 404 | 介入策略不存在或不属于路径中的工作流 | 刷新策略列表 |
| `intervention-policy-conflict` | 409 | 该工作流或节点已存在介入策略 | 编辑已有策略 |
| `intervention-policy-version-conflict` | 409 | 介入策略已被其他人修改 | 刷新后重新编辑 |
| `reusable-block-not-found` | 404 | 可复用块不存在 | 刷新可复用块列表 |
| `reusable-block-conflict` | 409 | 可复用块已被其他人修改 | 刷新后重新编辑 |
| `optimization-proposal-not-found` | 404 | 优化提案不存在 | 刷新提案列表 |
| `optimization-workflow-not-analyzable` | 422 | 工作流的发布版本中没有可分析的团队或智能路由节点 | 只对包含这些节点的工作流发起分析 |

## 触发器

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `trigger-not-found` | 404 | 触发器不存在。Webhook 地址中的 Token 错误或触发器已停用时也返回此错误 | 核对「Webhook 入口」，确认触发器为「已启用」 |
| `webhook-verification-failed` | 401 | Webhook 签名或时间戳校验失败。公开 Webhook 入口对此返回 `INVALID_SIGNATURE` JSON，不是 problem+json | 核对签名算法与 secret，见 [Webhook 与 API 事件](/api/webhooks) |
| `webhook-ip-not-allowed` | 403 | 来源 IP 不在该 Webhook 的 IP 白名单中 | 把调用方出口 IP 或网段加入白名单，见 [Webhook 触发](/guide/triggers/webhook) |
| `trigger-limit-exceeded` | 409 | 该工作流的触发器数量已达上限 | 删除不再使用的触发器 |
| `trigger-type-preview-only` | 409 | 该触发器类型目前只能预览，不能创建、编辑或启用 | 改用其他触发器类型 |

## Agent

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `agent-not-found` | 404 | Agent 不存在或不属于当前组织 | 确认链接与当前组织 |
| `agent-archived` | 409 | Agent 已归档 | 使用其他 Agent |
| `agent-version-conflict` | 409 | Agent 已被其他用户或其他标签页修改 | 刷新页面后重新编辑 |
| `agent-publish-validation` | 422 | Agent 发布校验未通过 | 按 `detail` 修正 Agent 画布 |
| `agent-sandbox-not-connected` | 409 | 有沙箱的 Agent 画布上没有连接沙箱，无法开始对话 | 在 Agent 画布上把 Sandbox 节点连到 Agent Main |
| `agent-canvas-invalid-mcp-tool-binding` | 422 | Agent 画布上的 MCP 节点配置不完整 | 在 MCP 节点中选择服务与工具 |
| `agent-canvas-invalid-harness` | 422 | Harness 或 Runtime 插件节点配置无效，或无沙箱 Agent 使用了 Harness | 按 `detail` 修正节点，见 [用 Harness 定制 Agent 运行时](/guide/agents/harness) |
| `agent-not-published` | 409 | Agent 尚未发布（对外 API、ACP `session/new` 也会返回） | 先发布 Agent |
| `agent-version-not-found` | 404 | Agent 版本不存在 | 刷新版本列表 |
| `conversation-not-found` | 404 | 对话不存在或不属于当前组织 | 确认链接与当前组织 |
| `conversation-ended` | 409 | 对话已结束或失败，不能再发消息或取消 | 新建对话 |
| `tool-call-not-found` | 404 | 工具调用不存在 | 刷新后确认待审批的工具调用 |
| `team/run-not-found` | 404 | 团队运行不存在 | 确认运行 ID |
| `a2a/agent-not-found` | 404 | A2A 调用的 Agent 不存在或未发布 | 确认 Agent ID 且 Agent 已发布 |

Agent 对外 API 的错误类型见 [Agent 对外 API](/api/agent-api)。

## 知识库

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `knowledge-base-not-found` | 404 | 知识库不存在 | 确认知识库未被删除 |
| `knowledge-base-embedding-model-not-configured` | 422 | 知识库没有可用的 Embedding 模型 | 按[检索配置](/guide/knowledge-base/retrieval)选择 Embedding 模型 |
| `document-unsupported-file-type` | 422 | 文件类型不受支持 | 改用 PDF、TXT、Markdown 或 DOCX |
| `document-file-too-large` | 422 | 文件超过大小上限 | 拆分文件后分别上传 |
| `document-empty-file` | 422 | 文件为空 | 检查文件内容 |
| `document-parse-failed` | 422 | 文档解析失败 | 确认文件未损坏，或转换格式后重新上传 |
| `document-chunk-failed` | 500 | 文档切分失败 | 重新上传；持续出现时联系部署管理员 |
| `knowledge-base-embedding-model-invalid` | 422 | 知识库绑定的模型配置不是 Embedding 类型 | 选择模型类型为 Embedding 的模型配置 |
| `document-multipart-required` | 415 | 文档上传请求不是 `multipart/form-data` | 以 `multipart/form-data` 上传，文件放在 `file` 字段 |

## 记忆

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `memory-instance-not-found` | 404 | 记忆实例不存在或不属于当前组织 | 确认链接与当前组织 |
| `memory-node-not-found` | 404 | 记忆节点不存在，或不属于路由中的记忆实例 | 确认节点 ID 与实例 ID 对应 |
| `memory-edge-not-found` | 404 | 记忆边不存在，或不属于路由中的记忆实例 | 刷新图谱后重试 |
| `memory-path-not-found` | 404 | 记忆路径（URI）不存在 | 确认 URI 拼写，或先创建路径 |
| `memory-version-not-found` | 404 | 版本不存在、不属于该节点，或节点尚无版本 | 刷新版本历史后重试 |
| `memory-glossary-keyword-conflict` | 409 | 关键词已绑定到该节点 | 无需重复添加 |
| `memory-edge-conflict` | 409 | 两个节点之间已有同名记忆边 | 换一个边名称，或复用已有边 |
| `memory-edge-cycle` | 409 | 创建这条边会在记忆图中形成环 | 调整父子方向 |
| `memory-path-conflict` | 409 | 记忆路径已存在 | 换一个 URI，或改为更新已有路径指向的节点 |
| `memory-version-chain-exists` | 409 | 节点已有版本，不能再用 create 模式 | 改用 `patch` 或 `append` 模式 |
| `memory-patch-target-not-found` | 409 | patch 的 `oldString` 不在当前版本内容中 | 刷新最新内容后重新指定 `oldString` |
| `memory-version-concurrent-update` | 409 | 最新版本在本次更新期间被并发修改 | 刷新后重试 |
| `memory-uri-invalid` | 400 | 记忆 URI 格式不合法（需为 `domain://path/segment`，不能有空段，深度与长度有上限） | 按 `detail` 修正 URI |
| `memory-cross-instance` | 400 | 路径或边引用的节点属于其他记忆实例 | 只在同一实例内的节点之间建路径或边 |

## Skill

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `skill-not-found` | 404 | Skill 不存在或不属于当前组织 | 确认链接与当前组织 |
| `skill-file-not-found` | 404 | 内置 Skill 的文件不存在 | 确认文件名 |
| `skill-builtin-readonly` | 403 | 内置 Skill 不能修改、归档、删除或增删文件 | 复制为自建 Skill 后再修改 |
| `skill-name-conflict` | 409 | 组织内已有同名 Skill | 换一个名称 |
| `skill-version-conflict` | 409 | Skill 已被其他用户或其他标签页修改 | 刷新后重新编辑 |
| `skill-already-archived` | 409 | Skill 已归档 | 无需再次归档 |
| `skill-file-name-invalid` | 400 | 文件名或相对路径不合法 | 去掉 `..`、绝对路径与非法字符 |
| `skill-file-name-conflict` | 409 | 同一次上传中有重复的文件路径 | 去掉重复文件后重新上传 |
| `skill-file-required` | 400 | multipart 请求中没有文件 | 至少选择一个文件 |
| `skill-file-too-large` | 400 | 单个文件超过 5 MB | 缩小或拆分文件 |
| `skill-multipart-required` | 415 | 上传请求不是 `multipart/form-data` | 以 `multipart/form-data` 上传 |

## 模型、MCP 与智能路由

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `llm/provider-error` | 502 | 模型服务商返回错误 | 检查 API Key、额度与模型名称 |
| `llm/timeout` | 504 | 模型服务商请求超时 | 稍后重试，或改用其他模型 |
| `llm/config-not-found` | 404 | 引用的模型配置不存在 | 在 Agent 画布的 LLM 模型节点中重新选择配置 |
| `llm/config-validation` | 400 | 模型配置校验失败 | 按 `detail` 修正配置 |
| `llm/provider-deletion-forbidden` | 403 | 内置模型服务商不能删除 | 无需处理 |
| `llm/config-name-conflict` | 409 | 组织内已有同名模型配置 | 换一个名称 |
| `llm/provider-not-found` | 404 | 模型服务商不存在或不属于当前组织 | 确认服务商未被删除 |
| `llm/provider-slug-conflict` | 409 | 组织内已有相同 slug 的模型服务商 | 换一个 slug |
| `llm/builtin-provider-field-immutable` | 403 | 内置模型服务商的 slug 与接口协议不能修改 | 只修改 Base URL、API Key 等可编辑字段 |
| `mcp/connection-failed` | 502 | 无法连接 MCP 服务 | 检查 MCP 服务地址与凭据，见 [MCP 工具](/guide/integrations/mcp-tools) |
| `mcp/connection-timeout` | 504 | 连接 MCP 服务超时 | 确认服务可从 AgentLoom 服务端访问 |
| `mcp/discovery-failed` | 502 | MCP 工具发现失败 | 确认服务实现了工具列表接口 |
| `mcp/stdio-disabled` | 403 | 当前部署禁止在服务端启动 stdio MCP 进程 | 改用 SSE 或 HTTP 传输；单租户自托管可由管理员设置 `APP_MCP_STDIO_ENABLED=true`，见 [MCP 工具](/guide/integrations/mcp-tools) |
| `mcp/server-config-not-found` | 404 | MCP 服务器配置不存在或已被删除 | 在「资源 → MCP 服务」重新接入；删除配置会同时停用其导入的工具 |
| `mcp/tool-not-found` | 404 | MCP 工具不存在 | 刷新工具列表 |
| `mcp/tool-deactivation-not-allowed` | 409 | 只能停用从 MCP 服务导入的工具 | 内置或自定义工具无需停用 |
| `mcp/import-conflict` | 409 | 导入的工具与已有工具冲突 | 选择「跳过」或「覆盖」冲突策略 |
| `routing/no-eligible-candidate` | 503 | 没有满足条件的候选模型：候选为空，或全部断路，或上下文窗口都小于输入 token 数 | 按 `detail` 中的候选数与健康数检查模型连接、Provider 状态与输入长度，见[智能路由](/guide/nodes/smart-routing) |
| `routing/fallback-exhausted` | 503 | 所有候选模型都不可用 | 检查各模型的健康状态 |
| `routing/strategy-not-found` | 404 | 路由策略不存在或未公开 | 从策略列表中选择 |

## 沙箱

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `sandbox-creation-failed` | 500 | 沙箱创建失败 | 确认部署启用了沙箱运行时，见 [Firecracker 沙箱](/deploy/firecracker) |
| `sandbox-timeout` | 504 | 沙箱操作超时 | 调大 Sandbox 节点的 Timeout，或拆分任务 |
| `sandbox-maintenance` | 503 | 沙箱运行时正在维护 | 稍后重试 |
| `sandbox-not-found` | 404 | 沙箱会话不存在或已被清理 | 重新运行 |
| `sandbox-invalid-state` | 409 | 沙箱当前状态不允许该操作 | 刷新后按当前状态操作 |
| `sandbox-config-validation` | 400 | 沙箱资源配置不合法 | 按 `detail` 修正 CPU、内存、磁盘或超时 |
| `sandbox-skill-payload-too-large` | 422 | 下发到沙箱会话的文件（技能与 runtime 插件包文件）单个超过 1 MiB 或合计超过 16 MiB | 减少 Agent 绑定的技能或插件，或缩小其中的文件 |
| `sandbox-runtime-plugin-unsupported-file` | 422 | runtime 插件包含非文本文件，不能下发到沙箱 | 请插件开发者移除二进制文件后重新打包上传 |
| `sandbox-node-not-found` | 404 | 沙箱运行时节点不存在 | 刷新节点列表 |
| `sandbox-node-conflict` | 409 | 节点名称或地址已登记，或节点未停用、仍有 microVM、无法探测时不能删除 | 按 `detail` 处理：先把节点状态改为 disabled、销毁其上的 microVM；节点不可达时带 `force=true` 删除 |
| `sandbox-stats-unavailable` | 409 | 当前无法获取沙箱统计信息 | 稍后重试 |

## API Token

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `api-key-invalid` | 401 | 请求头中的 API Token 无效 | 确认使用 `X-Api-Key` 头，值为完整的 `al_` 开头 Token |
| `platform-api-token-expired` | 401 | API Token 已过期 | 新建一个 Token |
| `platform-api-token-limit-exceeded` | 409 | 你在当前组织的 API Token 数量已达上限 | 吊销不再使用的 Token，见 [API Token](/guide/integrations/api-keys) |
| `insufficient-scope` | 403 | API Token 的作用域不包含该接口所需的权限，或该接口尚未声明权限 | 新建一个包含所需作用域的 Token，或留空作用域以继承账号权限，见 [API Token](/guide/integrations/api-keys) |
| `platform-api-token-invalid` | 401 | API Token 无效或已撤销 | 新建一个 Token |
| `platform-api-token-not-found` | 404 | API Token 不存在 | 刷新 Token 列表 |
| `platform-api-token-already-revoked` | 409 | API Token 已被撤销 | 无需再次撤销 |

## 生成应用、分享与导入

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `generated-app-public-share-not-ready` | 409 | 应用就绪状态不是发布候选，不能开启公开分享 | 见[生成应用](/guide/generated-apps/#门禁与就绪状态) |
| `generated-app-public-submission-invalid` | 422 | 公开应用的提交内容未通过校验 | 按页面提示补齐必填字段 |
| `generated-app-not-found` | 404 | 生成应用不存在或不属于当前组织 | 确认链接与当前组织 |
| `generated-app-artifact-not-found` | 404 | 生成应用的交付物不存在 | 重新运行生成 |
| `generated-app-artifact-too-large` | 413 | 交付物超过内联读取上限，不能以文本方式查看 | 无需处理；大文件不在 Studio 内联展示 |
| `generated-app-submission-not-found` | 404 | 生成应用的提交记录不存在 | 确认提交 ID |
| `generated-app-generation-run-not-found` | 404 | 生成运行不存在或不属于该应用 | 确认应用与运行 ID |
| `generated-app-repair-attempt-not-found` | 404 | 修复尝试不存在或不属于该运行 | 确认运行与修复尝试 ID |
| `generated-app-gate-definition-not-found` | 400 | 记录门禁结果时用了不存在的 Gate id | Gate id 只能是 `gate-0` 到 `gate-7` |
| `generated-app-binding-target-not-found` | 422 | 创建应用时指定的工作流或 Agent 不存在、不属于当前组织或尚未发布 | 先发布该工作流或 Agent，或不指定绑定目标、由生成过程从已发布的工作流与 Agent 中选择 |
| `generated-app-generation-run-in-progress` | 409 | 该应用已有排队中或运行中的生成运行；创建应用时已自动排队首次运行，紧接着再调用 start 也会得到它 | 等当前运行结束后再启动；用创建响应的 `generationRunId` 或运行列表轮询进度 |
| `share-not-found` | 404 | 分享链接不存在或无权访问 | 确认链接完整 |
| `share-copy-not-allowed` | 409 | 该分享链接不允许导入副本 | 请分享者改为可复制的分享 |
| `share-agent-not-published` | 409 | 被分享的 Agent 尚未发布，无法导入 | 请分享者发布 Agent |
| `share-expired` | 410 | 分享链接已过期 | 请分享者重新生成链接 |
| `share-revoked` | 410 | 分享链接已撤销 | 同上 |
| `share-workflow-not-published` | 409 | 被分享的工作流尚未发布 | 请分享者发布工作流 |
| `workflow-import-validation` | 422 | 导入的工作流文件无效 | 检查导出文件是否完整 |
| `workflow-import-model-not-found` | 409 | 当前组织缺少工作流依赖的模型配置 | 先创建所需模型配置，再导入 |

## 插件与市场

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `plugin-not-found` | 404 | 插件不存在或不属于当前组织 | 确认插件未被删除 |
| `plugin-already-exists` | 409 | 上传的版本不高于该插件 ID 已注册的版本（响应带 `currentVersion`、`uploadedVersion`），或同 ID 插件是从市场安装的副本 | 提升 `version` 后重新构建上传；市场副本用市场的「升级」更新；从市场重装已卸载的插件会直接重新启用原副本 |
| `plugin-listed` | 409 | 删除插件时它仍有上架中或审核中的市场条目（响应带 `listingId`、`listingStatus`） | 先下架该条目（`POST /api/v1/plugins/marketplace/listings/<listingId>/unlist`），再删除；已安装方的副本不受影响 |
| `plugin-version-conflict` | 409 | 插件已被其他用户修改 | 刷新后重试 |
| `plugin-validation-failed` | 422 | 插件包校验失败，`detail` 为原因 | 按 `detail` 修正插件包 |
| `plugin-inactive` | 422 | 插件未启用 | 在「插件」列表中启用后重试 |
| `plugin-signature-missing` | 400 | 插件包没有签名 | 用 `agentloom-plugin publish -k` 签名后上传 |
| `plugin-signature-invalid` | 422 | 签名校验失败：归档被改动，或签名公钥未在本组织登记 / 已撤销 | 重新签名，确认公钥已登记且未撤销 |
| `plugin-developer-key-invalid` | 400 | 开发者公钥格式无效：需要 RSA-2048 位或更长的 PEM 公钥 | 重新导出公钥 |
| `plugin-developer-key-not-found` | 404 | 开发者公钥不存在或不属于当前组织 | 刷新公钥列表 |
| `plugin-developer-key-conflict` | 409 | 相同指纹的公钥已登记；已撤销的公钥不能重新登记 | 使用已登记的公钥，或生成新的密钥对 |
| `plugin-developer-key-already-revoked` | 409 | 公钥已被撤销 | 无需再次撤销 |
| `plugin-earning-not-found` | 404 | 收益结算记录不存在或不属于当前组织 | 刷新结算列表后重试 |
| `runtime-plugin-not-found` | 404 | runtime 插件不存在或不属于当前组织 | 确认插件未被删除 |
| `runtime-plugin-already-exists` | 409 | 该 runtime 插件 ID 与版本已注册 | 提升版本后重新上传 |
| `runtime-plugin-version-conflict` | 409 | runtime 插件已被其他用户修改 | 刷新后重试 |
| `runtime-plugin-validation-failed` | 422 | runtime 插件包校验失败 | 按 `detail` 修正插件包 |
| `runtime-plugin-unsupported-dsh-version` | 422 | runtime 插件声明的 dsh 版本不受支持 | 按[开发 runtime 插件](/api/plugins/runtime)改用支持的 `dshVersion` |
| `runtime-plugin-inactive` | 422 | Agent 引用的 runtime 插件未处于启用状态（`detail` 带插件名称、版本与记录 id）。对话运行前（含已在运行的会话的下一轮）检查，作为对话失败原因和对外 API run 的 `error.type` 出现 | 在「Runtime 插件」页启用该插件后重新发送；或从 Agent 画布移除该插件节点并重新发布 |
| `marketplace-listing-not-found` | 404 | 市场条目不存在、未上架或无权访问 | 确认条目仍在市场中 |
| `marketplace-listing-conflict` | 409 | 市场条目当前状态不允许该操作，响应带 `currentStatus` | 刷新后按当前状态操作 |
| `marketplace-workflow-version-not-found` | 404 | 提交到市场的工作流版本不存在 | 选择已发布的工作流版本 |
| `marketplace-review-failed` | 422 | 上架审查未通过，响应带 `reviewResult` | 按未通过的检查项修正后重新提交 |
| `marketplace-review-conflict` | 409 | 你已评价过该条目 | 每个账号对同一条目只能评价一次 |
| `marketplace-review-install-required` | 403 | 评价插件条目前需要本组织已安装该插件 | 先安装插件 |
| `marketplace-review-own-listing` | 403 | 不能评价本组织发布的条目 | 无需处理 |

插件上传、签名与运行的错误类型见[插件开发](/api/plugins/)；runtime 插件的上传错误见[开发 runtime 插件](/api/plugins/runtime#出错时)。
