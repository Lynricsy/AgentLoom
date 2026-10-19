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
- URL 可以引用「请求体」端口收到的数据：写 <code v-pre>{{字段}}</code>，嵌套字段用点分路径（<code v-pre>{{item.id}}</code>），写法与 [输入预处理器](/guide/nodes/input-preprocessor) 的模板模式相同，但路径从端口收到的对象开始，不带端口 ID。例如 URL 为 <code v-pre>https://hacker-news.firebaseio.com/v0/item/{{id}}.json</code>、端口收到 `{"id": 50152307}` 时，请求 `…/item/50152307.json`。取到的值经 URL 编码后拼入；值必须是字符串、数字或布尔值。
- 以下情况节点失败，不会按字面量发出请求：占位符在端口数据中没有值（错误信息形如 <code v-pre>HTTP 请求 URL 中的占位符 {{id}} 在「请求体」端口数据中没有值</code>）；值是对象或数组；URL 中写了单花括号的 `{id}`（错误信息会提示改写为 <code v-pre>{{id}}</code>）。
- 请求体的取值顺序：「请求体」端口收到的对象若含 `body` 字段，用该字段；端口收到的对象不含 `body`、`query`、`headers` 字段时，整个对象作为请求体（包括被 URL 引用的字段）；端口没有数据时，使用配置中的 Body（可写 JSON，解析失败则按原文发送）。端口对象中的 `headers`、`query` 字段会合并到配置的请求头与 Query 参数之上。
- GET 请求不发送请求体，配置中的 Body 也不会发送：端口收到不含 `body`、`query`、`headers` 字段的对象时，其中没有被 URL 引用的字段转为 Query 参数（如上例端口收到 `{"id": 50152307, "print": "pretty"}` 时请求 `…/item/50152307.json?print=pretty`）；端口对象含 `body` 字段、或端口收到的是文本等非对象值时，节点失败，错误信息以 `GET 请求不能携带请求体` 开头，改用 POST / PUT / PATCH，或把参数放进 `query` 字段。
- 超时时间单位为秒，默认 30。
- 「非 2xx 视为失败」默认开启：响应状态不是 2xx 时节点失败，错误信息形如 `HTTP POST https://example.com 返回 500 Internal Server Error`。关闭后，非 2xx 响应也会让节点完成，适合探测类请求；此时执行结果中的 `ok` 与 `status` 仍如实记录响应状态。
- 「响应体」端口输出响应 body：响应的 Content-Type 为 `application/json` 或以 `+json` 结尾（如 `application/problem+json`、`application/vnd.api+json`）时解析为 JSON 值，其他类型输出原始文本。

## 相关

- [Code Executor](/guide/nodes/code-tool)
- [输入预处理器](/guide/nodes/input-preprocessor)
- [调试工作流](/guide/workflows/debugging)
