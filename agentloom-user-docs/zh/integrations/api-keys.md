---
title: API 密钥管理
---

# API 密钥管理

AgentLoom 提供了 API Token 机制，允许你从外部系统安全地调用 AgentLoom 的 REST API。本文介绍如何创建、管理和安全使用 API 密钥。

## API Token 概述

API Token 是一种长期有效的认证凭证，用于替代用户登录的方式进行 API 调用。它适合以下场景：

- 从脚本或自动化工具调用 AgentLoom API
- 在 CI/CD 流水线中集成 AgentLoom 功能
- 从自建服务或应用中调用 AgentLoom 的接口
- 构建基于 AgentLoom 的自定义集成

### Token 格式

AgentLoom 的 API Token 以 `al_` 为前缀，便于在配置文件和日志中识别。例如：

```
al_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 创建 API Token

### 创建权限

以下角色可以创建 API Token：

- 所有者（Owner）
- 管理员（Admin）
- 创建者（Creator）

### 创建步骤

> 界面提示：在 AgentLoom Studio 中，依次进入「设置」页面，找到「API Token」管理区域。

1. 点击「创建 Token」按钮
2. 填写以下信息：
   - **名称**：为 Token 设置一个描述性的名称，例如「CI/CD 集成」「监控脚本」等
   - **过期时间**（可选）：设置 Token 的有效期
3. 点击确认创建

创建成功后，系统会显示完整的 Token 值。

**重要提示**：Token 的完整值仅在创建时显示一次，之后无法再次查看。请务必立即将 Token 保存到安全的位置。

## 使用 API Token

### 认证方式

在调用 AgentLoom API 时，通过 HTTP 请求头传递 Token：

```
X-Api-Key: al_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

AgentLoom 的认证系统会先尝试 JWT Token 认证，如果没有 JWT Token，则使用 `X-Api-Key` 请求头中的 API Token 进行认证。

### 调用限制

为了保护平台的稳定性，API Token 的调用受到以下限制：

- **默认速率限制**：100 请求/分钟
- **日调用量限制**：受组织配额控制

当超过速率限制时，API 会返回 HTTP 429 状态码，并在响应头中包含：
- `Retry-After`：建议的等待时间（秒）
- `X-RateLimit-Limit`：速率限制上限
- `X-RateLimit-Remaining`：当前窗口内剩余请求数

**建议**：在你的应用中实现自动退避（backoff）机制，当收到 429 响应时按照 `Retry-After` 头指示的时间等待后重试。

## 管理 API Token

### 查看 Token 列表

> 界面提示：在 API Token 管理页面中，可以看到当前用户创建的所有 Token 列表。

Token 列表显示以下信息：

- Token 名称
- Token 前缀（用于识别，不显示完整值）
- 创建时间
- 最近使用时间
- 状态

### 撤销 Token

如果某个 Token 不再需要或疑似泄露，你应该立即撤销它。

> 界面提示：在 Token 列表中，点击目标 Token 旁边的「撤销」按钮。

撤销后的 Token 立即失效，所有使用该 Token 的 API 调用都会被拒绝。撤销操作不可恢复 -- 如果后续仍需要 API 访问，你需要创建新的 Token。

### Token 数量限制

每个用户可以创建的 Token 数量有上限。如果达到上限，需要先撤销不再使用的 Token 才能创建新的。

## 安全存储建议

API Token 的安全性取决于你如何存储和使用它。以下是一些重要的安全建议：

### 应该做的

- **使用环境变量**：在应用中通过环境变量引用 Token，而不是硬编码在代码中
- **加密存储**：如果需要持久化存储 Token，使用加密的配置管理工具
- **最小权限**：为不同的用途创建不同的 Token，便于单独管理和撤销
- **定期轮换**：定期撤销旧 Token 并创建新的，降低长期暴露的风险
- **及时撤销**：当某个集成不再需要时，立即撤销对应的 Token

### 不应该做的

- **不要提交到代码仓库**：永远不要将 Token 提交到 Git 等版本控制系统中
- **不要在日志中打印**：避免在应用日志中输出完整的 Token 值
- **不要通过不安全的渠道传输**：不要通过即时消息、邮件等不加密的渠道分享 Token
- **不要使用过期未撤销的 Token**：如果 Token 已不再使用，及时撤销而不是放任不管

### 如果 Token 泄露了

如果你发现或怀疑 Token 已经泄露：

1. 立即撤销该 Token
2. 检查审计日志，确认是否有异常的 API 调用
3. 创建新的 Token 并更新所有使用该 Token 的配置
4. 评估是否需要进一步的安全措施

## Token 的安全机制

AgentLoom 在内部对 Token 实施了以下安全保护：

- **哈希存储**：Token 在服务端使用 SHA-256 哈希存储，即使数据库泄露也无法还原原始 Token
- **租户绑定**：Token 与创建者的组织绑定，只能访问该组织的资源
- **速率限制**：防止暴力破解和滥用
- **审计追踪**：所有通过 Token 进行的 API 调用都会被记录

## 常见问题

### Token 创建后忘记保存了

Token 仅在创建时显示一次，无法找回。你需要撤销该 Token 并创建一个新的。

### API 调用返回 401 错误

可能的原因：
1. Token 已被撤销
2. Token 格式不正确（应以 `al_` 开头）
3. 请求头名称不正确（应为 `X-Api-Key`）

### API 调用返回 429 错误

说明已达到速率限制。请等待 `Retry-After` 头指示的时间后重试，或考虑优化调用频率。

## 下一步

- [MCP 工具](./mcp-tools.md) -- 了解如何连接外部工具
- [使用插件](./plugins.md) -- 了解插件生态系统
