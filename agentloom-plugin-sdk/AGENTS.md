# AGENTLOOM PLUGIN SDK 知识库

`@agentloom/plugin-sdk` 是插件生态的 TypeScript 公共边界，提供 manifest、节点执行接口、Zod 校验、端口 helper 与 RSA-PSS 签名工具。

## 模块

```text
src/
├── index.ts
├── types/
│   ├── port.ts
│   ├── manifest.ts
│   ├── execution.ts
│   ├── node.ts
│   └── plugin.ts
├── validation/
│   ├── manifest-schema.ts
│   ├── node-schema.ts
│   └── validate-manifest.ts
├── helpers/
└── signing/
```

根 `index.ts` 是 public barrel。公开接口使用 `unknown` 与具体类型，不暴露 `any`。

## PortDataType

`src/types/port.ts` 暴露 14 值 `PortDataType` 与 `PORT_DATA_TYPES`：

`model | text | json | array | image | audio | tool | sandbox | knowledge | skill | agent | memory | exec | volume`

canonical 全集定义在 `@agentloom/contracts`。SDK 保留本地字面量镜像以避免插件运行时依赖 contracts；`agentloom-contracts/src/port-data-type.test.ts` 机械读取 SDK、Rust、Studio 与 server 源文件执行同步检查。新增端口值先进入 contracts，再同步生态镜像。

## 校验

- SDK 固定使用 Zod 3.x，面向外部插件生态，不引用 workspace 的 Zod 4 catalog。
- `PluginManifestSchema` 校验 reverse-domain id、semver、permissions、WASM 入口和签名 metadata。
- `CustomNodeDefinitionSchema` 校验节点定义和端口；CLI 的 `loadPlugin()` 逐节点消费该 schema。
- object schema strip 未知字段；`validateManifest()` 使用 safeParse 返回结构化 `ValidationResult`。
- `defineNode()` 执行 identity + `Object.freeze()`，不做深冻结。

## 生命周期与执行接口

`AgentLoomPlugin` 提供 manifest、nodes、`activate()` 与 `deactivate()`。`NodeExecutionContext` 中的 logger 与 execution metadata 由宿主注入，插件节点只消费上下文。

## 签名

`src/signing/` 使用 canonical unsigned archive payload：

1. 读取 ZIP 与 manifest。
2. 剥离 signature、contentHash、developerKeyFingerprint。
3. deep-sort JSON keys，并对文件计算 SHA-256。
4. 使用 RSA-PSS SHA-256 签名。
5. 将签名 metadata 写回 manifest。
6. verify 重新计算相同 payload。

`.alp` 是 ZIP 归档，包含 `manifest.json`、`dist/`、`package.json`，可包含 `README.md`。

## Workspace 与构建

SDK 是根 pnpm workspace 成员。server 与 plugin-cli 通过 `workspace:*` 依赖它。`prepare` / `prepack` 运行 `pnpm build`，因此容器或 workspace install 必须在安装前提供完整 SDK 源码。

```bash
pnpm --filter @agentloom/plugin-sdk build
pnpm --filter @agentloom/plugin-sdk typecheck
pnpm --filter @agentloom/plugin-sdk test
```

产物为 ESM/CJS 双输出和对应类型声明，发布内容只包含 `dist/`。
