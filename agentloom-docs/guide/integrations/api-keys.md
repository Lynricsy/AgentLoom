---
docType: howto
---

# API Token

API Token 是以你的身份调用 AgentLoom REST API 的长期凭证，前缀为 `al_`，适合 CI 脚本、内部服务等需要调用平台接口（例如运行工作流、发送 [API 事件](/guide/triggers/api-event)）的场景。请求头格式、限流与错误格式见 [API 约定](/api/)。

它与另外两种凭证不同：

- **Agent API Key**（前缀 `alak_`）只能调用某一个 Agent 的对外接口，见 [通过 API 调用 Agent](/guide/agents/api-access)。
- **Webhook URL** 中的 Token 只能启动一个触发器，见 [Webhook 触发](/guide/triggers/webhook)。

前提：

- 创建与撤销 Token 需要 owner、admin 或 creator 角色；operator 与 viewer 只能查看列表。
- 每个用户在每个组织中最多保留 20 个未撤销的 Token（已过期但未撤销的也计入），超出时创建失败。

## 权限范围

Token 调用接口时的权限等于**你在该组织中的当前角色**，每次请求时重新判定：你的角色被降级后，Token 的权限随之降低；你被移出组织后，需要角色的接口都会拒绝该 Token。

「作用域」可以在角色之上再收窄 Token 的权限，不能放宽。作用域取值为权限名，用空格或逗号分隔，例如 `workflow:read workflow:run`；填写不认识的值时创建失败。

- 留空：Token 拥有你当前角色的全部权限。
- 填写后：Token 只能调用所需权限在作用域内的接口，其余接口返回 403（`insufficient-scope`）。尚未按权限声明的接口对限定了作用域的 Token 一律拒绝。

可用的权限名与每个权限允许的角色见 `agentloom-contracts/src/rbac.ts` 的 `RBAC_PERMISSION_MATRIX`；创建对话框的提示中也列出了全部取值。

## 创建 Token

1. 点击侧边栏底部的「设置」，在「通用」分组中点击「API Token」（路径 `/settings/api-tokens`）。

   页面标题为「API Token」，列出你自己创建的 Token；其他成员的 Token 不在此显示。

2. 点击「创建 Token」。
3. 在「创建 API Token」对话框中填写：
   - 「名称」（必填），例如「CI 部署流水线」；
   - 「作用域（可选）」，见上一节；
   - 「过期时间（可选）」，留空表示长期有效，直至被撤销。
4. 点击「创建 Token」。

   对话框变为「保存你的 API Token」，显示以 `al_` 开头的完整 Token。这是明文唯一一次出现，点击「复制 Token」存入密钥管理器后点击「我已保存」。

列表新增一行：「名称」下方显示作用域（未填写时显示「继承账号全部权限」），「前缀」显示 Token 的前几位，「状态」为「有效」，「最后使用」为「从未使用」。

## 验证 Token 可用

1. 按 [API 约定](/api/) 中的平台 API Token 写法，用 `X-Api-Key` 请求头调用任一接口。

   请求成功后回到「API Token」页，该 Token 的「最后使用」更新为调用时间。

## 撤销 Token

Token 泄露或不再使用时撤销它。撤销不可恢复。

1. 在「API Token」列表中点击目标 Token 行的「撤销」。
2. 在「撤销 API Token？」确认框中点击「确认撤销」。

   页面提示「Token 已撤销」，状态变为「已撤销」。之后使用该 Token 的请求返回 401 `platform-api-token-invalid`。

用状态筛选（「仅有效」「仅已撤销」「全部」）查看已撤销的 Token。过期的 Token 状态显示「已过期」，请求返回 401 `platform-api-token-expired`。

## 相关

- [API 约定](/api/)：凭证、请求头、限流
- [角色与权限](/guide/collaboration/roles)
