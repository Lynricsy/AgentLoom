---
docType: reference
---

# 角色与权限

组织中的每个成员有且只有一个角色。本页列出五种角色以及各项操作允许哪些角色执行。

## 角色

| 角色标识 | Studio 显示 | 邀请对话框中的说明 |
| --- | --- | --- |
| `owner` | 所有者 | 完全控制，包含计费与组织删除 |
| `admin` | 管理员 | 管理成员、资源与平台设置 |
| `creator` | 创建者 | 创建并编辑工作流、Agent 与资源 |
| `operator` | 操作员 | 执行工作流并处理人工介入 |
| `viewer` | 访客 | 只读浏览 |

## 权限如何判定

- 每个接口单独声明允许的角色列表，服务端只检查你的角色是否在列表中。角色之间**没有继承**：表中某项只列 owner 时，admin 也不能执行。实现见 [安全模型](/dev/server/security)。
- 服务端每次请求都按数据库中的当前角色判定，角色修改后立即生效。
- Studio 侧边栏与按钮的显示依据登录令牌中的角色，角色变更后需要重新登录才会更新。
- 被拒绝的请求返回 403 `insufficient-permissions`。
- 「全部」表示五种角色都允许；「登录即可」表示接口不检查角色，只要求已登录。

## 工作流与执行

| 操作 | 允许的角色 |
| --- | --- |
| 查看工作流、版本、触发器、触发历史、介入策略 | 全部 |
| 新建、编辑画布、导入工作流 | owner、admin、creator |
| 发布、保存版本、回滚版本、归档、删除工作流 | owner、admin |
| 运行工作流、导出工作流 | owner、admin、creator、operator |
| 新建、编辑、启停、删除触发器 | owner、admin、creator |
| 新建、编辑、删除介入策略 | owner、admin、creator |
| 查看执行记录与证据 | 全部 |
| 取消、恢复执行，处理人工介入 | owner、admin、creator、operator |
| 查看与处理死信队列 | owner、admin |
| 创建、撤销工作流分享链接 | owner、admin、creator |
| 通过分享链接复制工作流 | 全部 |

## Agent

| 操作 | 允许的角色 |
| --- | --- |
| 查看 Agent 与版本 | 全部 |
| 新建、编辑 Agent 画布 | owner、admin、creator |
| 发布、保存版本、回滚版本、删除 Agent | owner、admin |
| 查看对话 | 全部 |
| 发起对话、发送消息、取消、删除对话 | owner、admin、creator、operator |
| 查看 Agent API Key | owner、admin、creator |
| 创建、吊销 Agent API Key | owner、admin |

## 资源

| 操作 | 允许的角色 |
| --- | --- |
| 查看知识库、测试检索 | 全部 |
| 新建知识库、上传与删除文档、修改设置、重建索引、删除知识库 | owner、admin、creator、operator |
| 查看技能 | 登录即可 |
| 新建、编辑、归档技能，管理技能文件 | owner、admin、creator |
| 删除技能 | owner、admin |
| 查看记忆实例 | 全部 |
| 新建、修改、删除记忆实例与记忆节点 | owner、admin、creator |
| 查看工作区 | 全部 |
| 新建工作区、写入文件、删除工作区 | owner、admin、creator、operator |
| 查看沙箱 | 全部 |
| 新建、启动、停止、删除沙箱 | owner、admin、creator |
| 登记沙箱运行节点 | owner、admin |
| 查看 LLM 模型与提供方 | 全部 |
| 新建、修改、删除 LLM 模型与提供方 | owner、admin |
| 测试 LLM 连接、发现模型 | owner、admin、creator、operator |
| 查看 MCP 服务与工具（凭据只显示键名） | owner、admin、creator |
| 接入、测试、导入、修改、删除 MCP 服务 | owner、admin |
| 查看插件与用量 | 全部 |
| 注册插件 | owner、admin、creator |
| 启用、停用、删除插件 | owner、admin |
| 查看生成应用 | 全部 |
| 新建生成应用、生成、管理公开链接 | owner、admin、creator |
| 删除生成应用 | owner、admin |

## 市场与开发者

| 操作 | 允许的角色 |
| --- | --- |
| 浏览市场 | 无需登录 |
| 安装市场条目 | owner、admin、creator、operator |
| 卸载插件副本 | owner、admin、creator |
| 升级已安装的插件 | owner、admin |
| 发表评价 | 登录即可 |
| 提交上架、下架、重新上架 | owner、admin、creator |
| 管理开发者公钥 | owner、admin、creator |
| 查看收益、推进打款状态 | owner、admin |

## 组织与设置

| 操作 | 允许的角色 |
| --- | --- |
| 查看组织信息 | 登录即可 |
| 查看成员名册、邀请成员、修改角色、移除成员 | owner、admin |
| 查看与修改组织自治策略 | owner |
| 查看、修改资源配额 | owner、admin |
| 查看监控 | owner、admin |
| 查看审计日志 | owner、admin |
| 查看、修改私有部署配置 | owner、admin |
| 查看端到端加密密钥 | owner、admin、creator、operator |
| 生成、轮换、撤销端到端加密密钥 | owner、admin |
| 查看自己的 API Token | 全部 |
| 创建、撤销 API Token | owner、admin、creator |
| 安全设置、通知、个人偏好 | 全部 |

成员管理还有以下附加规则：

- admin 不能邀请 owner，也不能移除 owner（403 `admin-cannot-invite-owner` / `admin-cannot-remove-owner`）。
- 组织至少保留一名 owner：把最后一名 owner 降级或移除时返回 409 `sole-owner-constraint`。

## 相关

- [管理组织成员](/guide/collaboration/workspace)
- [API Token](/guide/integrations/api-keys)：API Token 以创建者当前的角色调用接口
