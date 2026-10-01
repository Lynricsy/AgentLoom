---
docType: reference
---

# 触发器

触发器节点是工作流的起点，决定工作流由什么启动，并把启动时携带的数据从「触发数据」端口交给下游。节点面板 Trigger 分组提供 Manual Trigger（手动）、Schedule（定时）、Webhook 与 API Event 四种触发器。

## 端口与配置

### Manual Trigger

<!--@include: ../../_generated/nodes/manual-trigger.md-->

### Schedule

<!--@include: ../../_generated/nodes/schedule-trigger.md-->

### Webhook

<!--@include: ../../_generated/nodes/webhook-trigger.md-->

### API Event

<!--@include: ../../_generated/nodes/api-event-trigger.md-->

## 使用要点

- 四种触发器在执行时行为相同：读取本次执行的输入参数（去掉内部 `_meta` 字段）作为「触发数据」输出，并记录触发类型。区别只在于执行由谁发起、输入参数从哪里来。
- Manual Trigger 的配置面板「手动触发配置」可通过「添加参数」声明「输出参数」；未声明时显示「无 (使用默认 payload)」。手动运行时填写的参数即触发数据，见 [输入参数](/guide/workflows/input-parameters)。
- Schedule 的配置面板「定时触发器」提供「每分钟」「每小时」「每天 0:00」「每周一 0:00」预设，也可直接填写 Cron 表达式（例 `0 * * * *`）；「时区」默认 `UTC`。定时规则的管理见 [定时触发](/guide/triggers/cron)。
- Webhook 节点的配置面板只读：展示该工作流已创建的 Webhook 触发器的入口 URL、鉴权模式、IP 白名单，以及签名模式下的密钥。鉴权模式与 IP 白名单在「工作流设置 → 触发器」中编辑，见 [Webhook 触发](/guide/triggers/webhook)。签名验证模式下调用方用 Secret 对 `{timestamp}.{body}` 计算 HMAC-SHA256，并携带时间戳与签名两个请求头，算法见 [Webhook 与 API 事件](/api/webhooks)。外部系统 POST 的 JSON 载荷就是触发数据。
- API Event 需要填写「事件来源」（例 `github`、`stripe`）与「事件类型」（例 `push`、`payment.completed`），可选「过滤表达式」。见 [API 事件触发](/guide/triggers/api-event)。
- 触发器没有输入端口，只能作为起点。

## 相关

- [自动化概述](/guide/triggers/)
- [运行与监控](/guide/workflows/running)
