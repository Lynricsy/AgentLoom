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

## 工作流与执行

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `workflow-not-found` | 404 | 工作流不存在或不属于当前组织 | 确认链接与当前组织 |
| `version-conflict` | 409 | 工作流已被其他用户或其他标签页修改 | 刷新页面后重新编辑 |
| `workflow-archived` | 409 | 工作流已归档，不能编辑、发布或执行 | 使用其他工作流；归档不可撤销 |
| `workflow-not-published` | 409 | 工作流未发布，不能启动执行或创建触发器 | 先发布，见[版本管理](/guide/workflows/versions) |
| `workflow-publish-validation` | 422 | 发布前校验未通过，`detail` 为第一条原因 | 按 `detail` 修正画布后重新发布 |
| `workflow-publish-agent-binding` | 422 | 工作流中的 Agent 节点未绑定可用的已发布 Agent | 在每个 Agent 节点中重新选择已发布的 Agent |
| `workflow-publish-legacy-llm-agent` | 422 | 工作流包含已废弃的 llm-agent 节点 | 按 `detail` 改用 Agent 节点 |
| `workflow-publish-autonomy-cap` | 422 | 节点配置超出组织自治上限 | 调整节点配置，或请管理员修改[自治策略](/guide/collaboration/autonomy-policy) |
| `workflow-launch-input-invalid` | 422 | 启动参数未通过输入参数校验 | 按 `errors` 修正输入，见[输入参数](/guide/workflows/input-parameters) |
| `workflow-launch-schema-version-mismatch` | 409 | 启动时使用的输入参数版本与已发布版本不一致 | 刷新页面后重新运行 |
| `cyclic-graph` | 400 | 工作流图存在环路 | 删除形成环路的连线 |
| `node-type-mismatch` | 422 | 某条连线两端的端口数据类型不兼容 | 按 `detail` 中的节点与端口修改连线 |
| `reusable-block-expansion-failed` | 422 | 运行前展开可复用块失败：块缺少内嵌定义、块端口没有映射到块内节点，或连线连到块上不存在的端口 | 从「My Blocks」重新拖入该块，或删除失效连线后重新发布，见 [Reusable Block](/guide/nodes/reusable-block) |
| `execution-not-found` | 404 | 执行记录不存在 | 确认执行 ID |
| `execution-not-cancellable` | 409 | 执行已结束，不能取消 | 无需处理 |
| `execution-not-resumable` | 409 | 只有失败的执行可以恢复；已暂停的执行需先处理人工干预 | 见[调试工作流](/guide/workflows/debugging) |
| `intervention-not-allowed` | 409 | 该步骤当前不在等待干预状态 | 刷新执行页查看最新状态 |

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

## 模型、MCP 与智能路由

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `llm/provider-error` | 502 | 模型服务商返回错误 | 检查 API Key、额度与模型名称 |
| `llm/timeout` | 504 | 模型服务商请求超时 | 稍后重试，或改用其他模型 |
| `llm/config-not-found` | 404 | 引用的模型配置不存在 | 在 Agent 画布的 LLM 模型节点中重新选择配置 |
| `llm/config-validation` | 400 | 模型配置校验失败 | 按 `detail` 修正配置 |
| `llm/provider-deletion-forbidden` | 403 | 内置模型服务商不能删除 | 无需处理 |
| `mcp/connection-failed` | 502 | 无法连接 MCP 服务 | 检查 MCP 服务地址与凭据，见 [MCP 工具](/guide/integrations/mcp-tools) |
| `mcp/connection-timeout` | 504 | 连接 MCP 服务超时 | 确认服务可从 AgentLoom 服务端访问 |
| `mcp/discovery-failed` | 502 | MCP 工具发现失败 | 确认服务实现了工具列表接口 |
| `routing/insufficient-models` | 400 | 智能路由的候选模型不足 | 至少连接两个模型，见[智能路由](/guide/nodes/smart-routing) |
| `routing/fallback-exhausted` | 503 | 所有候选模型都不可用 | 检查各模型的健康状态 |

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

## API Token

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `api-key-invalid` | 401 | 请求头中的 API Token 无效 | 确认使用 `X-Api-Key` 头，值为完整的 `al_` 开头 Token |
| `platform-api-token-expired` | 401 | API Token 已过期 | 新建一个 Token |
| `platform-api-token-limit-exceeded` | 409 | 你在当前组织的 API Token 数量已达上限 | 吊销不再使用的 Token，见 [API Token](/guide/integrations/api-keys) |
| `insufficient-scope` | 403 | API Token 的作用域不包含该接口所需的权限，或该接口尚未声明权限 | 新建一个包含所需作用域的 Token，或留空作用域以继承账号权限，见 [API Token](/guide/integrations/api-keys) |

## 生成应用、分享与导入

| type | HTTP 状态 | 含义 | 处理建议 |
| --- | --- | --- | --- |
| `generated-app-public-share-not-ready` | 409 | 应用就绪状态不是发布候选，不能开启公开分享 | 见[生成应用](/guide/generated-apps/#门禁与就绪状态) |
| `generated-app-public-submission-invalid` | 422 | 公开应用的提交内容未通过校验 | 按页面提示补齐必填字段 |
| `share-expired` | 410 | 分享链接已过期 | 请分享者重新生成链接 |
| `share-revoked` | 410 | 分享链接已撤销 | 同上 |
| `share-workflow-not-published` | 409 | 被分享的工作流尚未发布 | 请分享者发布工作流 |
| `workflow-import-validation` | 422 | 导入的工作流文件无效 | 检查导出文件是否完整 |
| `workflow-import-model-not-found` | 409 | 当前组织缺少工作流依赖的模型配置 | 先创建所需模型配置，再导入 |

插件上传、签名与运行的错误类型见[插件开发](/api/plugins/)；runtime 插件的上传错误见[开发 runtime 插件](/api/plugins/runtime#出错时)。
