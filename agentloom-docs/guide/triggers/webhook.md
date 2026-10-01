---
docType: howto
---

# Webhook 触发

本页说明如何为一个已发布的工作流生成 Webhook 入口，让只能配置回调 URL 的外部系统（表单服务、监控告警、CI）在事件发生时启动它。请求格式、签名算法与示例脚本只在 [让外部系统启动工作流](/api/webhooks) 一处说明，本页只讲 Studio 中的配置。

前提：

- 工作流已发布，你的角色是 owner、admin 或 creator。
- 外部系统发送的 JSON 对象的每个顶层字段都会成为一个启动参数。工作流声明了 [输入参数](/guide/workflows/input-parameters) 时，只保留已声明的字段，未声明的字段直接丢弃；缺少必填字段或类型不符时该次请求返回 422。先在「输入参数」中声明外部系统会发送、工作流需要用到的字段。

## 创建 Webhook 触发器

1. 在工作流画布顶部工具栏点击「触发器」，在「触发器管理」中点击「添加触发器」，选择「Webhook」。
2. 填写「触发器名称」，例如「CRM 回调入口」。
3. 在「验证模式」中选择一项：

   | 选项 | 调用方需要提供 | 适合 |
   | --- | --- | --- |
   | Simple：仅校验 Token 与 IP 白名单（默认） | 完整 URL（Token 在路径中） | 内网或已受信的来源系统 |
   | Signed：额外要求 HMAC-SHA256 签名与时间戳校验 | 完整 URL，以及每个请求的时间戳与签名请求头 | 公网来源，需要防篡改与防重放 |
   | GitHub：校验 GitHub 的 X-Hub-Signature-256 签名 | 完整 URL；GitHub 仓库 Webhook 的 Secret 填触发器的 Secret | GitHub 仓库事件，见 [接入 GitHub 仓库](#接入-github-仓库) |

4. （可选）在「IP 白名单」中填写允许的来源，每行一个或以英文逗号分隔，可以是单个 IPv4 / IPv6 地址，也可以是 CIDR 网段，例如 `203.0.113.10` 或 `10.0.0.0/8`。留空表示不限制来源。IP 白名单可以与任一验证模式同时使用。
5. 点击「创建触发器」。

   对话框切换为「保存 Webhook 凭证」，列出三项，每项都有「复制」按钮：

   - **Webhook URL**：`<API 地址>/api/v1/webhooks/<token>`，外部系统向它发送 `POST`。Token 是 64 位十六进制串，持有完整 URL 即可在 Simple 模式下调用，按密码保管。
   - **Token**：URL 中的同一个值。
   - **Secret**：Signed 与 GitHub 模式下用于签名，默认以圆点遮盖，点击「显示」查看。

6. 复制 Secret 后点击「完成」。

   Secret 只在这一次显示。之后在卡片的「Webhook 入口」与「编辑」对话框的「当前 Webhook 入口」中仍能看到 URL 与 Token，但看不到 Secret。

## 把 URL 配置到外部系统

1. 在外部系统的 Webhook / 回调设置中填写 Webhook URL，请求方法 `POST`，内容类型 `application/json`。
2. 选择了 Signed 模式时，外部系统必须为每个请求生成时间戳与签名请求头。凭证对话框的「调用方如何签名」列出三步签名方法和一段 `curl` 示例，签名算法的完整说明见 [让外部系统启动工作流](/api/webhooks) 中「Webhook：签名模式」一节。
3. 让外部系统发送一次测试请求，或用 [API 页面](/api/webhooks) 中的 `curl` / Node 脚本发送。

   请求被接受时外部系统收到 `202` 与本次执行 ID。在 Studio 中打开该触发器的「历史记录」，出现一条「成功」记录，「查看执行」可打开这次执行；卡片的「触发次数」加一。

## 请求被拒绝时

在触发器的「历史记录」中按状态筛选，错误信息说明具体原因：

| 外部系统看到 | 历史记录 | 原因与处理 |
| --- | --- | --- |
| 404 `trigger-not-found` | 无 | URL 中的 Token 不存在，或触发器已停用。核对 URL，确认卡片显示「已启用」 |
| 403 `webhook-ip-not-allowed` | IP 被拒 | 来源 IP 不在白名单中。来源 IP 是部署方可信反向代理记录的连接地址，调用方自填的 `X-Forwarded-For` 不生效 |
| 401 `INVALID_SIGNATURE` | 签名失败 | Signed 模式：缺少签名或时间戳请求头、签名不匹配、时间戳与服务器时间相差超过 300 秒。GitHub 模式：缺少 `X-Hub-Signature-256` 或签名不匹配 |
| 422 `workflow-launch-input-invalid` | 失败 | 缺少工作流输入参数中的必填字段，或字段类型不符，错误信息列出字段 |

## 接入 GitHub 仓库

GitHub 用自己的 `X-Hub-Signature-256` 请求头签名，不发送 AgentLoom 的时间戳头，因此用 GitHub 验证模式接入。

1. 按 [创建 Webhook 触发器](#创建-webhook-触发器) 新建触发器，「验证模式」选「GitHub：校验 GitHub 的 X-Hub-Signature-256 签名」，保存凭证对话框中的 Webhook URL 与 Secret。
2. 打开 GitHub 仓库的 **Settings → Webhooks → Add webhook**：
   - **Payload URL**：Webhook URL；
   - **Content type**：`application/json`；
   - **Secret**：触发器的 Secret；
   - 选择要触发工作流的事件，点击 **Add webhook**。

   GitHub 随即发送一次 `ping` 事件。AgentLoom 校验签名后返回 200，不启动工作流，触发历史记录一条「跳过」。

3. 之后每次事件，工作流的启动参数是 GitHub 请求体的全部顶层字段，外加 `_eventSource`（固定为 `github`）、`_eventType`（`X-GitHub-Event`，如 `push`）与 `_deliveryId`（`X-GitHub-Delivery`）。工作流声明了输入参数时，同样只保留已声明的字段。

同一个投递（`X-GitHub-Delivery` 相同）在 24 小时内只启动一次工作流：在 GitHub 的 **Recent Deliveries** 中点击 **Redeliver** 会收到 200，触发历史记录一条「跳过」。启动执行失败的投递不计入，可以重新投递。

## 更换泄露的 Token 或 Secret

Token 与 Secret 创建后不能重新生成，编辑触发器也不会改变它们。

1. 按 [创建 Webhook 触发器](#创建-webhook-触发器) 新建一个触发器，把新 URL 与 Secret 配置到外部系统。
2. 在旧触发器卡片上点击「删除」并确认。

   旧 URL 立即返回 404。

## 切换验证模式

1. 在卡片上点击「编辑」，在「验证模式」中改选，点击「保存更改」。

   卡片「Webhook 入口」下的「验证模式」显示新的模式。Token 与 Secret 不变，从 Simple 改为 Signed 或 GitHub 后，外部系统需要开始发送对应的签名请求头。

## 相关

- [让外部系统启动工作流](/api/webhooks)：请求格式、签名算法、错误响应
- [Webhook 节点](/guide/nodes/trigger)
- [API 事件触发](/guide/triggers/api-event)：一个事件同时启动多个工作流
