<!-- 由 scripts/docs-reference/generate.ts 生成，勿手改；运行 pnpm docs:gen -->

类型 `http-tool`，分类 Tool。来源：`agentloom-studio/src/features/canvas/types/nodeTypeRegistry.ts`。

**输入端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-in` |  | `exec` |  |  | 执行流入口，前序节点完成后触发 HTTP 请求 |
| `request-in` | 请求体 | `json` |  |  | HTTP 请求发送的 JSON Body 数据 |

**输出端口**

| 端口 ID | 名称 | 数据类型 | 必填 | 多连接 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `exec-out` |  | `exec` |  |  | 执行流出口，HTTP 请求完成后触发下游节点 |
| `response-out` | 响应体 | `json` |  |  | HTTP 响应返回的 JSON Body 数据 |

**配置项**

| 配置键 | 名称 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `url` | URL | `string` |  | 是 |  |
| `method` | Method | `string` | `"GET"` | 是 | 取值：`GET` / `POST` / `PUT` / `PATCH` / `DELETE` |
| `headers` | Headers | `string` |  |  |  |
| `queryParams` | Query Params | `string` |  |  |  |
| `body` | Body | `string` |  |  |  |
| `authType` | 认证方式 | `string` | `"none"` |  | 取值：`none` / `bearer` / `basic` / `api-key` |
| `authConfig` | 认证配置 | `string` |  |  |  |
| `timeout` | 超时时间 | `number` | `30` |  |  |
| `failOnHttpError` | 非 2xx 视为失败 | `boolean` | `true` |  |  |
