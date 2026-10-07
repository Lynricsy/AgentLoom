---
docType: reference
---

# Plugin SDK

`@agentloom/plugin-sdk`（源码 `agentloom-plugin-sdk/`）导出插件的类型、运行时校验 schema、辅助函数与签名函数。包目前不在 npm 上发布；插件项目以 `file:` 依赖引用仓库中的目录。包内依赖 Zod 3（与服务端的 Zod 4 分开），插件项目需要校验 schema 时也用 Zod 3。

## 清单 `PluginManifest`

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `id` | string | 是 | 反向域名格式，`^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$`；脚手架生成 `com.agentloom.<name>` |
| `name` | string | 是 | 非空 |
| `version` | string | 是 | semver |
| `author` | string | 是 | 非空 |
| `description` | string | 是 | 非空 |
| `license` | string | 是 | 非空 |
| `minPlatformVersion` | string | 是 | semver |
| `permissions` | `PluginPermission[]` | 是 | 见下表，可为空数组 |
| `keywords` | string[] | 否 | 每项非空 |
| `icon` | string | 否 | 图标路径或 URL |
| `homepage` | string | 否 | 主页地址 |
| `repository` | string | 否 | 仓库地址 |
| `wasmEntry` | string | 节点插件注册时必填 | 归档内 `.wasm` 文件的相对路径；`build --wasm` 写为 `dist/plugin.wasm`。`kind` 为 `runtime` 时不得声明 |
| `kind` | `'node'` \| `'runtime'` | 否 | 默认 `node`；`runtime` 表示 sandbox 运行态的 runtime 插件，见 [开发 runtime 插件](/api/plugins/runtime) |
| `runtime.dshVersion` | string | `kind` 为 `runtime` 时必填 | 目标 `@deepseek-ai/dsh` 版本，上传时与平台支持的版本精确比对 |
| `runtime.patch` | string | `kind` 为 `runtime` 时必填 | 归档内 `.yml` / `.yaml` 文件的安全相对路径（不以 `/` 开头、不含 `..` 与 `\`），即插件的 `cordis.patch.yml` |
| `runtime.entry` | string | `kind` 为 `runtime` 时必填 | 归档内 `.js` / `.mjs` 入口的安全相对路径 |
| `runtime.configSchema` | object | 否 | 插件配置的 JSON Schema，Studio 的 runtime-plugin 节点面板据此渲染标量字段 |
| `sandbox.allowedHosts` | string[] | 否 | 允许访问的主机；仅当 `permissions` 含 `network:outbound` 时服务端采用 |
| `sandbox.maxMemoryPages` | number | 否 | 只能收紧：小于平台上限 `4096` 时采用，超过上限或非正数时按 `4096` 处理 |
| `sandbox.timeoutMs` | number | 否 | 只能收紧：小于平台上限 `30000` 毫秒时采用，超过上限或非正数时按 `30000` 处理 |
| `signature` | string | — | `publish` 写入：Base64 的 RSA-PSS 签名 |
| `contentHash` | string | — | `publish` 写入：64 位十六进制 SHA-256 |
| `developerKeyFingerprint` | string | — | `publish` 写入：公钥 SPKI DER 的 SHA-256 十六进制 |

服务端沙箱的实际限制见 [服务端插件系统](/dev/server/plugins)。

### `PluginPermission`

`network:outbound`、`storage:read`、`storage:write`、`knowledge:read`、`knowledge:write`、`llm:invoke`。常量 `PLUGIN_PERMISSIONS` 为全集。

## 节点 `CustomNodeDefinition`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | string | 节点类型标识，插件内唯一 |
| `label` | string | 画布显示名 |
| `category` | `CustomNodeCategory` | `transform`、`filter`、`aggregator`、`connector`、`utility`（常量 `CUSTOM_NODE_CATEGORIES`） |
| `description` | string | 说明 |
| `inputPorts` / `outputPorts` | `PortDefinition[]` | 端口 |
| `configSchema` | object | 可选，JSON Schema 风格的配置定义 |
| `execute(context)` | function | 仅用于 `agentloom-plugin dev` 本地预览，服务端不调用 |

WASM 项目在 `node-definitions.json` 里写同样结构的数组（不含 `execute`）。

### `PortDefinition`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 端口 ID，也是执行时 `inputs` / 输出对象的键 |
| `label` | string | 显示名 |
| `dataType` | `PortDataType` | 取值与平台端口类型一致，常量 `PORT_DATA_TYPES`；清单见 [端口类型](/guide/getting-started/) |
| `required` | boolean | 可选 |
| `description` | string | 可选 |

## WASM 执行契约

- 服务端调用导出函数 `execute`；画布上该插件节点的配置里设置了 `functionName` 时改调该函数。
- 输入：JSON 字符串 `{"nodeType":"<节点 type>","inputs":{…},"config":{…}}`。
- 输出：以输出端口 ID 为键的 JSON 对象，例如 `{"result":"hello"}`。不要包成 `{"outputs":{…}}`。
- 失败：通过 Extism 错误返回，不要返回伪装成功的输出。

## 本地预览契约

`execute(context: NodeExecutionContext): Promise<NodeExecutionResult>`

| `NodeExecutionContext` 字段 | 说明 |
| --- | --- |
| `inputs` | 输入端口值 |
| `config` | 节点配置 |
| `logger` | `debug` / `info` / `warn` / `error` |
| `metadata` | `{ executionId, stepId, nodeId }`，预览服务器每次生成随机 UUID |

`NodeExecutionResult` 为 `{ outputs, metadata? }`。插件对象 `AgentLoomPlugin` 为 `{ manifest, nodes, activate(), deactivate() }`。

## 辅助函数

| 函数 | 说明 |
| --- | --- |
| `defineInputPort(options)` / `defineOutputPort(options)` | 返回 `PortDefinition`；输出端口不接受 `required` |
| `defineNode(definition)` | 返回浅冻结（`Object.freeze`）的节点定义 |
| `isPortDataType(value)` / `isValidPermission(value)` / `isPluginManifest(value)` | 类型守卫 |
| `validateManifest(manifest)` | 返回 `{ valid: true, errors: [] }` 或 `{ valid: false, errors: string[] }` |
| `PluginManifestSchema`、`CustomNodeDefinitionSchema`、`PortDefinitionSchema` 等 | Zod 3 schema |

## 签名函数

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| `signArchive` | `(data, privateKeyPem) => Promise<string>` | 对规范化载荷做 RSA-PSS / SHA-256 签名，salt 长度等于摘要长度，返回 Base64 |
| `verifyArchiveSignature` | `(data, signatureBase64, publicKeyPem) => Promise<boolean>` | 验签；任何错误返回 `false`，不抛异常 |
| `computeContentHash` | `(data) => Promise<string>` | 规范化载荷的 SHA-256 十六进制 |
| `createCanonicalArchivePayload` | `(data) => Promise<Buffer>` | 规范化载荷：去掉清单中的 `signature`、`contentHash`、`developerKeyFingerprint`，键深度排序，其余文件逐个取 SHA-256 并按路径排序 |
| `computeKeyFingerprint` | `(publicKeyPem) => string` | 公钥 SPKI DER 的 SHA-256 十六进制（同步） |
| `readArchiveManifest` | `(data) => Promise<object>` | 读取归档内 `manifest.json` |
| `updateArchiveManifest` | `(data, manifest) => Promise<Buffer>` | 替换 `manifest.json`，返回新归档 |

`data` 为 `.alp` 文件内容（`Buffer` 或 `Uint8Array`）。因为规范化载荷排除了签名字段，把签名写回清单不会改变内容哈希。
