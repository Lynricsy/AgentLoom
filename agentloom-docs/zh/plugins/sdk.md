# 插件 SDK

`@agentloom/plugin-sdk` 是 AgentLoom 插件开发的核心依赖，提供类型定义、校验工具、辅助函数和签名模块。

## 基本信息

| 属性     | 值                                                                   |
| -------- | -------------------------------------------------------------------- |
| 包名     | `@agentloom/plugin-sdk`                                              |
| 版本     | `0.1.0`                                                              |
| 运行时   | Node.js                                                              |
| 输出格式 | ESM (`index.js`) + CJS (`index.cjs`) + 类型声明 (`.d.ts` / `.d.cts`) |
| 构建工具 | `tsup`                                                               |
| 核心依赖 | `zod ^3.23.0`、`jszip ^3.10.1`、`semver ^7.6.0`                      |

::: tip Zod 版本说明
SDK 使用 **Zod 3.x**（非 4.x），这是面向插件生态兼容性的有意选择。确保你的插件项目也使用 Zod 3.x。
:::

## 安装

```bash
npm install @agentloom/plugin-sdk
# 或
pnpm add @agentloom/plugin-sdk
```

## 模块结构

SDK 通过根入口导出四个子模块：

```text
@agentloom/plugin-sdk
├── types       # 类型定义
├── validation  # Zod 校验 schema
├── helpers     # 辅助函数与类型守卫
└── signing     # RSA-PSS 签名与验证
```

## 类型定义

### 端口类型 — `PortDataType`

平台统一的 10 种端口数据类型：

```typescript
type PortDataType =
  | "model"
  | "text"
  | "json"
  | "image"
  | "audio"
  | "tool"
  | "sandbox"
  | "knowledge"
  | "skill"
  | "agent";
```

### 端口定义 — `PortDefinition`

```typescript
interface PortDefinition {
  /** 端口唯一标识 */
  id: string;
  /** 显示标签 */
  label: string;
  /** 数据类型 */
  dataType: PortDataType;
  /** 是否必需，默认 true */
  required?: boolean;
  /** 端口描述 */
  description?: string;
}
```

### 插件清单 — `PluginManifest`

```typescript
interface PluginManifest {
  /** 插件唯一 ID，格式：com.agentloom.{name} */
  id: string;
  /** 插件名称 */
  name: string;
  /** 语义化版本号 */
  version: string;
  /** 作者 */
  author: string;
  /** 描述 */
  description: string;
  /** 开源许可证 */
  license: string;
  /** 最低平台版本要求 */
  minPlatformVersion: string;
  /** 声明的权限列表 */
  permissions: PluginPermission[];

  // 签名相关（可选，publish 时自动注入）
  signature?: string;
  contentHash?: string;
  developerKeyFingerprint?: string;
  wasmEntry?: string;
  sandbox?: object;
}
```

### 插件权限 — `PluginPermission`

```typescript
type PluginPermission =
  | "network:outbound"
  | "storage:read"
  | "storage:write"
  | "knowledge:read"
  | "knowledge:write"
  | "llm:invoke";
```

### 节点类别 — `CustomNodeCategory`

```typescript
type CustomNodeCategory =
  | "transform"
  | "filter"
  | "aggregator"
  | "connector"
  | "utility";
```

### 自定义节点定义 — `CustomNodeDefinition`

```typescript
interface CustomNodeDefinition {
  /** 节点类型标识 */
  type: string;
  /** 显示标签 */
  label: string;
  /** 节点类别 */
  category: CustomNodeCategory;
  /** 节点描述 */
  description: string;
  /** 输入端口 */
  inputPorts: PortDefinition[];
  /** 输出端口 */
  outputPorts: PortDefinition[];
  /** 配置 schema（JSON Schema 格式） */
  configSchema?: JsonSchemaDefinition;
  /** 执行函数 */
  execute: (context: NodeExecutionContext) => Promise<NodeExecutionResult>;
}
```

### 执行上下文 — `NodeExecutionContext`

```typescript
interface NodeExecutionContext {
  /** 输入端口数据，key 为端口 id */
  inputs: Record<string, unknown>;
  /** 节点配置 */
  config: Record<string, unknown>;
  /** 日志记录器 */
  logger: PluginLogger;
  /** 执行元数据 */
  metadata: {
    executionId: string;
    stepId: string;
    nodeId: string;
  };
}
```

### 执行结果 — `NodeExecutionResult`

```typescript
interface NodeExecutionResult {
  /** 输出端口数据，key 为端口 id */
  outputs: Record<string, unknown>;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}
```

### 日志记录器 — `PluginLogger`

```typescript
interface PluginLogger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}
```

### 插件接口 — `AgentLoomPlugin`

```typescript
interface AgentLoomPlugin {
  /** 插件清单 */
  manifest: PluginManifest;
  /** 自定义节点列表 */
  nodes: CustomNodeDefinition[];
  /** 插件激活钩子 */
  activate: () => Promise<void>;
  /** 插件停用钩子 */
  deactivate: () => Promise<void>;
}
```

## 辅助函数

### 端口定义辅助

```typescript
import { defineInputPort, defineOutputPort } from "@agentloom/plugin-sdk";

// 定义输入端口
const textInput = defineInputPort({
  id: "text-in",
  label: "文本输入",
  dataType: "text",
  required: true,
  description: "待处理的文本内容",
});

// 定义输出端口
const textOutput = defineOutputPort({
  id: "text-out",
  label: "文本输出",
  dataType: "text",
  description: "处理后的文本",
});
```

### 节点定义辅助

```typescript
import { defineNode } from "@agentloom/plugin-sdk";

const myNode = defineNode({
  type: "my-transform",
  label: "我的转换器",
  category: "transform",
  description: "自定义文本转换",
  inputPorts: [textInput],
  outputPorts: [textOutput],
  async execute(context) {
    const text = String(context.inputs["text-in"]);
    return { outputs: { "text-out": text.toUpperCase() } };
  },
});
```

::: info
`defineNode` 返回一个 `Object.freeze` 冻结的节点定义对象，确保不可变性。
:::

### 类型守卫

```typescript
import {
  isPortDataType,
  isValidPermission,
  isPluginManifest,
} from "@agentloom/plugin-sdk";

isPortDataType("text"); // true
isPortDataType("unknown"); // false
isValidPermission("llm:invoke"); // true
isPluginManifest(someObject); // boolean
```

## 签名模块

签名模块提供 `.alp` 插件包的 RSA-PSS 签名和验证能力。

### 签名流程

```typescript
import { signArchive, computeContentHash } from "@agentloom/plugin-sdk";

// 读取 .alp 文件
const alpData = fs.readFileSync("my-plugin.alp");
const privateKey = fs.readFileSync("keys/private.pem", "utf-8");

// 计算内容哈希
const contentHash = await computeContentHash(alpData);

// 签名
const signature = await signArchive(alpData, privateKey);
```

### 验证流程

```typescript
import { verifyArchiveSignature } from "@agentloom/plugin-sdk";

const publicKey = fs.readFileSync("keys/public.pem", "utf-8");

const isValid = await verifyArchiveSignature(
  alpData,
  signatureBase64,
  publicKey,
);
// 验证失败时返回 false（不抛异常）
```

### 归档工具函数

```typescript
import {
  readArchiveManifest,
  updateArchiveManifest,
  createCanonicalArchivePayload,
  computeSha256Hex,
  computeKeyFingerprint,
} from "@agentloom/plugin-sdk";

// 读取 .alp 内的 manifest.json
const manifest = await readArchiveManifest(alpData);

// 更新 .alp 内的 manifest
const newAlpData = await updateArchiveManifest(alpData, updatedManifest);

// 创建规范化归档载荷（用于签名/验签）
// 自动剥离签名元数据字段、深排序 key、逐文件 SHA-256
const canonicalPayload = await createCanonicalArchivePayload(alpData);

// 计算密钥指纹（SPKI DER 的 SHA-256）
const fingerprint = await computeKeyFingerprint(publicKeyPem);
```

### 签名算法细节

| 参数             | 值                               |
| ---------------- | -------------------------------- |
| 算法             | RSA-PSS                          |
| 哈希             | SHA-256                          |
| 签名 salt length | `DIGEST`                         |
| 验证 salt length | `AUTO`                           |
| 规范化           | 深排序 JSON key + 逐文件 SHA-256 |
| 密钥指纹         | SPKI DER 的 SHA-256 hex          |
