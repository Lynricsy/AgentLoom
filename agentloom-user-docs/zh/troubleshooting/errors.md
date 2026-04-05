---
title: 错误参考
---

# 错误参考

本页列出了使用 AgentLoom 时可能遇到的常见错误消息，包括错误的原因解释和解决方案。

## HTTP 状态码说明

在查看具体错误之前，先了解常见的 HTTP 状态码含义：

| 状态码 | 含义 | 常见场景 |
|--------|------|----------|
| 400 | 请求格式错误 | 提交的数据格式不正确或缺少必填字段 |
| 401 | 未授权 | 登录已过期或 API Key 无效 |
| 403 | 权限不足 | 当前角色无权执行此操作 |
| 404 | 资源不存在 | 访问的工作流、Agent 或其他资源已被删除或不存在 |
| 409 | 冲突 | 版本冲突或资源治理阻断 |
| 429 | 请求过于频繁 | API 限流触发 |
| 500 | 服务器内部错误 | 系统异常，请联系技术支持 |

## 认证与权限错误

| 错误消息 | 原因 | 解决方案 |
|----------|------|----------|
| Unauthorized | JWT Token 已过期或无效 | 刷新页面重新登录。如果使用 API Key，请确认密钥有效且未被撤销 |
| Tenant required | 请求缺少租户信息 | 确保你已加入至少一个组织并选择了当前工作区 |
| Insufficient permissions | 当前角色权限不足 | 联系组织 owner 或 admin 提升你的角色权限。所需角色请参考各功能文档 |
| MFA verification required | 需要两步验证 | 打开认证器应用，输入当前显示的动态验证码 |
| Invalid API key | API Key 无效 | 确认 API Key 以 `al_` 为前缀且未被撤销，通过 `X-Api-Key` 请求头传递 |

## 工作流编辑错误

| 错误消息 | 原因 | 解决方案 |
|----------|------|----------|
| Version conflict | 工作流版本冲突（OCC） | 其他人或会话已修改了此工作流。刷新页面获取最新版本后重新编辑 |
| Incompatible port types | 端口类型不兼容，无法连线 | 确认源端口和目标端口的数据类型匹配。将鼠标悬停在端口上可查看类型标签 |
| Circular dependency detected | 检测到循环依赖 | 工作流必须是有向无环图（DAG）。检查连线是否形成了环路，断开造成循环的连线 |
| Node configuration invalid | 节点配置不完整或无效 | 点击节点查看配置面板，检查是否有必填项未填写或配置值不符合要求 |

## 工作流执行错误

| 错误消息 | 原因 | 解决方案 |
|----------|------|----------|
| Execution quota exceeded | 日执行量配额已用尽 | 等待次日配额重置，或联系管理员调整配额。查看 设置 > 资源配额 了解当前使用量 |
| Concurrent execution limit reached | 并发执行数已达上限 | 等待当前执行完成后再发起新的执行，或联系管理员调整并发限制 |
| Execution timed out | 工作流执行超时 | 检查各节点的执行耗时，优化长耗时节点的配置。对于沙箱节点，可增加超时时长 |
| Node execution failed | 某个节点执行失败 | 查看失败节点的详细错误信息。常见原因包括模型调用失败、输入数据格式错误等 |
| Workflow not published | 触发器触发了未发布的工作流 | 在画布工具栏中点击"发布"按钮发布工作流后再配置触发器 |
| Resource governance blocked | 资源治理策略阻断了执行 | 查看 设置 > 资源配额 了解被阻断的原因。可能是组织级或工作流级的治理暂停 |

## LLM 模型调用错误

| 错误消息 | 原因 | 解决方案 |
|----------|------|----------|
| Model API key invalid | 模型提供商的 API Key 无效 | 检查并更新模型提供商的 API Key 配置 |
| Model not available | 选择的模型暂时不可用 | 尝试切换到其他模型。如果使用了智能路由，FALLBACK_CHAIN 策略会自动切换备选模型 |
| Rate limit exceeded (model provider) | 模型提供商的调用频率限制 | 稍后重试，或切换到其他模型提供商。这是外部模型服务的限流，与 AgentLoom 平台限流无关 |
| Context length exceeded | 输入内容超出模型的上下文窗口限制 | 减少输入内容的长度，或选择支持更长上下文的模型 |
| Model response timeout | 模型响应超时 | 网络问题或模型服务负载较高。稍后重试 |

## 知识库错误

| 错误消息 | 原因 | 解决方案 |
|----------|------|----------|
| Document processing failed | 文档处理失败 | 确认文档格式是否受支持、文件是否损坏。尝试重新上传 |
| Knowledge base not found | 知识库不存在 | 知识库可能已被删除。检查资源列表确认知识库是否存在 |
| No results found | 检索未找到相关内容 | 降低相似度阈值、增加 Top K 数量、确认文档中确实包含相关内容 |
| Document too large | 文档超出大小限制 | 将大文档拆分为多个较小的文件后分别上传 |

## 沙箱错误

| 错误消息 | 原因 | 解决方案 |
|----------|------|----------|
| Sandbox session timeout | 沙箱会话超时 | 增加沙箱节点的超时配置。默认超时为 2 分钟 |
| Sandbox resource limit exceeded | 沙箱资源（CPU/内存）超限 | 优化在沙箱中执行的操作，或增加沙箱的资源配置 |
| File too large | 沙箱中的文件超出大小限制 | 文本文件预览限制为 10MB。减少文件大小或分段处理 |
| Path traversal detected | 文件路径安全检查失败 | 确保访问的文件路径在工作区目录范围内，不包含 `../` 等路径穿越字符 |
| Sandbox session not found | 沙箱会话不存在 | 沙箱会话可能已过期或被清理。重新执行工作流创建新的沙箱会话 |

## 触发器错误

| 错误消息 | 原因 | 解决方案 |
|----------|------|----------|
| Webhook signature verification failed | Webhook 签名验证失败 | 确认外部系统使用了正确的 Secret 和签名算法（HMAC-SHA256）进行签名 |
| Invalid cron expression | Cron 表达式格式无效 | 检查 Cron 表达式的语法。标准格式为五个字段：`分 时 日 月 周` |
| Trigger not enabled | 触发器未启用 | 在触发器配置中启用触发器，并确保工作流已发布 |
| IP not in whitelist | 请求 IP 不在白名单中 | 如果配置了 IP 白名单，确认发送请求的 IP 地址已添加到白名单中 |

## API 集成错误

| 错误消息 | 原因 | 解决方案 |
|----------|------|----------|
| Rate limit exceeded | API 调用频率超出限制（默认 100 次/分钟） | 查看响应头中的 `Retry-After` 和 `X-RateLimit-*` 字段，等待后重试。优化调用频率 |
| Daily API call limit exceeded | 日 API 调用量配额已用尽 | 等待次日配额重置，或联系管理员调整日调用量限制 |
| Invalid request body | 请求体格式不正确 | 确认请求体为合法的 JSON 格式，且包含所有必填字段 |
| Resource not found | 请求的资源不存在 | 确认请求 URL 中的资源 ID 正确。资源可能已被删除 |

## 市场错误

| 错误消息 | 原因 | 解决方案 |
|----------|------|----------|
| Workflow must be published before listing | 工作流需要先发布才能上架到市场 | 在画布中发布工作流后再尝试上架 |
| Insufficient role for marketplace install | 角色权限不足以安装市场中的工作流 | 安装市场工作流需要 operator 或以上角色权限 |
| Plugin signature verification failed | 插件签名验证失败 | 确认插件包（.alp 文件）的签名有效且未被篡改 |

## 通用建议

如果遇到上表中未列出的错误：

1. **记录错误信息**：复制完整的错误消息和发生时间
2. **检查网络**：确认网络连接正常，尝试刷新页面
3. **重试操作**：某些临时性错误在重试后会自动恢复
4. **查看审计日志**：管理员可以在 设置 > 审计日志 中查看详细的操作记录
5. **联系支持**：如果问题持续存在，通过平台反馈渠道提交问题报告
