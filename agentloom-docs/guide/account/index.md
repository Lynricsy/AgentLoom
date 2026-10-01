---
docType: reference
---

# 账户与设置

本页列出个人账户与组织设置的入口位置，以及「设置」中每一项的路径、可访问角色与说明页面。

## 入口位置

侧边栏底部从上到下依次是：

| 入口 | 作用 |
| --- | --- |
| 「设置」 | 打开设置首页 `/settings`，左侧为设置导航 |
| 通知铃铛 | 打开通知下拉框，见 [通知](/guide/account/notifications) |
| 用户菜单（显示你的邮箱） | 「主题」切换「浅色」「深色」「系统」，以及「退出登录」 |

用户菜单中没有「设置」或个人资料入口。显示名与头像目前不能在 Studio 中修改。

## 设置导航

| 分组 | 项 | 路径 | 可访问角色 | 说明 |
| --- | --- | --- | --- | --- |
| 通用 | 概览 | `/settings` | 全部 | 各设置项的卡片入口 |
| 通用 | 个人偏好 | `/settings/preferences` | 全部 | 见下文 |
| 通用 | API Token | `/settings/api-tokens` | 查看：全部；创建与撤销：owner、admin、creator | [API Token](/guide/integrations/api-keys) |
| 通用 | 通知 | `/settings/notifications` | 全部 | [通知](/guide/account/notifications) |
| 通用 | 组织 | `/settings/organization` | 组织信息：全部；成员名册：owner、admin | [管理组织成员](/guide/collaboration/workspace) |
| 安全 | 安全设置 | `/settings/security` | 全部 | [账户安全](/guide/account/security) |
| 安全 | 加密 | `/settings/encryption` | 查看：owner、admin、creator、operator；管理：owner、admin | [账户安全](/guide/account/security) |
| 安全 | 自治策略 | `/settings/security/autonomy-policy` | owner | [组织自治策略](/guide/collaboration/autonomy-policy) |
| 平台 | 监控 | `/settings/monitoring` | owner、admin | 组织运行状态 |
| 平台 | 资源配额 | `/settings/resource-quotas` | owner、admin | 组织的执行与资源限额 |
| 平台 | 私有部署 | `/settings/private-deployment` | owner、admin | 私有化部署配置 |
| 审计 | 审计日志 | `/settings/audit-logs` | owner、admin | 组织内操作的审计记录 |

设置导航对所有角色显示全部项；无权访问的页面在加载数据时报错或显示无权限提示。侧边栏「运维」分组中的「监控」「审计日志」指向同一页面。

## 个人偏好

「个人偏好」只对当前账号生效，目前包含一项：

- **对话标题生成 → 标题生成模型**：为自动生成 Agent 对话标题单独指定一个 LLM 模型。选择「使用组织默认」清除个人偏好，恢复使用组织默认模型。保存后提示「偏好已更新」。

## 登录方式

登录页支持邮箱与密码，以及「使用 Google 继续」「使用 GitHub 继续」两种第三方登录。Studio 中没有把第三方账号绑定到已有邮箱账号的入口。注册步骤见 [快速开始](/guide/getting-started/quickstart)。

## 相关

- [账户安全](/guide/account/security)
- [通知](/guide/account/notifications)
- [角色与权限](/guide/collaboration/roles)
