---
docType: reference
---

# HTTP Request

向外部 HTTP 接口发送请求，并把响应体交给下游节点。URL、方法、请求头、Query 参数、请求体与认证方式在配置面板中填写，上游数据可以通过「请求体」端口动态提供。

## 端口与配置

<!--@include: ../../_generated/nodes/http-tool.md-->

## 使用要点

- 配置面板标题为「HTTP 请求」，包含「请求头」「Query 参数」两组键值列表、「认证方式」与「非 2xx 视为失败」开关。认证方式为 Bearer、Basic（用户名/密码）或 API Key；API Key 的「传递位置」可选「请求头」或「Query 参数」。
- URL 为空时节点失败，错误信息为 `HTTP Tool 节点缺少 URL 配置`。
- 请求体的取值顺序：「请求体」端口收到的对象若含 `body` 字段，用该字段；端口收到的对象不含 `body`、`query`、`headers` 字段时，整个对象作为请求体；端口没有数据时，使用配置中的 Body（可写 JSON，解析失败则按原文发送）。端口对象中的 `headers`、`query` 字段会合并到配置的请求头与 Query 参数之上。
- 超时时间单位为秒，默认 30。
- 「非 2xx 视为失败」默认开启：响应状态不是 2xx 时节点失败，错误信息形如 `HTTP POST https://example.com 返回 500 Internal Server Error`。关闭后，非 2xx 响应也会让节点完成，适合探测类请求；此时执行结果中的 `ok` 与 `status` 仍如实记录响应状态。
- 「响应体」端口输出响应 body。

## 相关

- [Code Executor](/guide/nodes/code-tool)
- [输入预处理器](/guide/nodes/input-preprocessor)
- [调试工作流](/guide/workflows/debugging)
