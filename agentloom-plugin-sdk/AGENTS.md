# Repository Guidelines

## Project Overview

`@agentloom/plugin-sdk` 是插件作者与 AgentLoom 宿主之间的 TypeScript 公共边界，提供 manifest、节点与执行上下文类型、运行时校验、端口 helper，以及 `.alp` 归档签名工具。

本包面向外部插件生态；改动公开类型、校验行为、归档 canonical payload 或导出路径时，应按兼容性变更处理。跨包通用约束与端口全集的 canonical 定义参见根 `AGENTS.md`。

## Architecture & Data Flow

公开 API 从 `src/index.ts` 统一导出 `types`、`validation`、`helpers`、`signing` 四个模块：

1. 插件作者使用 `PluginManifest`、`CustomNodeDefinition`、`AgentLoomPlugin` 等类型描述插件。
2. `PluginManifestSchema` 与 `CustomNodeDefinitionSchema` 在 CLI、宿主边界校验不可信输入。
3. `defineInputPort()`、`defineOutputPort()` 构造端口；`defineNode()` 对节点定义做浅冻结。
4. plugin CLI 将插件构建为 `.alp` ZIP，并调用本包签名函数生成和校验 canonical payload。

`.alp` 根目录包含 `manifest.json`、`package.json`、`dist/`；有可序列化节点时包含 `node-definitions.json`，项目存在说明文件时可包含 `README.md`。

## Key Directories

```text
src/
├── index.ts                  # 唯一公共 barrel
├── types/                    # manifest、node、execution、plugin、port 契约
├── validation/               # Zod schema 与 validateManifest()
├── helpers/                  # 端口构造器、类型守卫
└── signing/                  # ZIP 读取、canonical 化、签名与验签
```

测试与实现同目录放置，文件名使用 `*.test.ts`；Vitest 只收集 `src/**/*.test.ts`。

## Development Commands

从 monorepo 根目录执行：

```bash
pnpm --filter @agentloom/plugin-sdk build
pnpm --filter @agentloom/plugin-sdk typecheck
pnpm --filter @agentloom/plugin-sdk test
pnpm --filter @agentloom/plugin-sdk test -- src/signing/signing.test.ts
```

`prepare` 与 `prepack` 都会运行 `pnpm build`。安装或打包场景必须保留完整源码，使生命周期脚本能够生成 `dist/`。

## Code Conventions & Common Patterns

- 公共入口只从各目录 `index.ts` 逐层导出；新增公共符号必须接入 barrel，内部 helper 不应意外暴露。
- 公共边界接收不可信值时使用 `unknown`、schema 或类型守卫，不使用 `any`。
- `validateManifest()` 使用 `safeParse()`，返回 `{ valid: true, errors: [] }` 或带路径的错误字符串数组；不要在此 API 中抛出普通校验错误。
- Zod object schema 默认 `.strip()` 未知字段。若改变为 strict 或 passthrough，须先确认 CLI 和既有插件的兼容性。
- `defineNode()` 仅执行 `Object.freeze()` 浅冻结；不要假定端口数组或嵌套配置已冻结。
- `NodeExecutionContext` 的 inputs、config、logger 和 execution metadata 由宿主注入；节点通过异步 `execute()` 返回 outputs 与可选 metadata。
- manifest ID 使用 reverse-domain 格式，版本字段使用 semver；签名哈希与密钥指纹是 64 字符小写 SHA-256 hex。

### Zod Version Policy

`package.json` 必须直接依赖 `zod: ^3.23.0`，不使用 workspace catalog 中的 Zod 4。原因是本包发布给外部插件生态，运行时 schema 与类型推导需要保持 Zod 3 兼容；其他 catalog 依赖不改变这一例外。

### Port Type Mirror

`src/types/port.ts` 本地维护 14 值镜像：

`model | text | json | array | image | audio | tool | sandbox | knowledge | skill | agent | memory | exec | volume`

canonical 全集位于 `@agentloom/contracts`。新增或删除值时先更新 contracts，再同步本文件；`agentloom-contracts/src/port-data-type.test.ts` 会读取 SDK、Rust type-engine、Studio 和 server 源码，机械校验集合关系。不要改写 `portDataTypes` 常量的可提取字面量数组形状。

### Signing and Canonical Payload

`createCanonicalArchivePayload()` 不对 ZIP 原始字节签名，而是构造稳定 JSON descriptor：

1. 读取并解析根 `manifest.json`，拒绝缺失、非对象或非法 JSON。
2. 从 manifest 移除 `signature`、`contentHash`、`developerKeyFingerprint`。
3. 递归排序 manifest 对象键；数组顺序保持不变。
4. 规范归档路径，拒绝空路径、`.`、`..` 与规范化后的重复路径。
5. 对 manifest 之外的每个文件计算 SHA-256，并按路径排序文件描述项。

`computeContentHash()` 对 canonical payload 计算 SHA-256。`signArchive()` 使用 SHA-256 + RSA-PSS，签名 salt 长度等于 digest；`verifyArchiveSignature()` 使用 RSA-PSS 自动 salt 长度并在无效归档、签名或公钥时返回 `false`。签名元数据写回 manifest 后 canonical hash 必须保持不变。

## Important Files

- `src/types/manifest.ts`：权限、节点分类、manifest 与签名 metadata 类型。
- `src/types/port.ts`：14 值端口镜像与 `PortDefinition`。
- `src/validation/manifest-schema.ts`：reverse-domain、semver、WASM 与 sandbox 校验。
- `src/validation/node-schema.ts`：节点可序列化部分、分类和端口校验。
- `src/signing/archive.ts`：归档路径规范化与 canonical descriptor。
- `src/signing/sign.ts` / `verify.ts`：RSA-PSS 签名和验签。
- `tsup.config.ts`：发布构建入口和双模块输出。

## Runtime/Tooling Preferences

源码按 Node.js ESM 编写，目标为 ES2022，TypeScript 使用 strict 与 Bundler module resolution。`tsup` 从 `src/index.ts` 同时生成 ESM `dist/index.js`、CJS `dist/index.cjs`、声明文件和 sourcemap，并在构建前清理 `dist/`；npm 包只发布 `dist/`。

归档处理统一使用 `JSZip`，密码学统一使用 `node:crypto`。不要另造 ZIP canonical 化或签名实现，否则会破坏 CLI、发布端与验签端的一致性。

## Testing & QA

- validation 测试覆盖合法输入、字段路径错误、未知字段剥离及 manifest/node 边界。
- helper 测试覆盖端口构造结果、浅冻结和类型守卫。
- signing 测试覆盖 ZIP 条目顺序无关性、签名 metadata 嵌入前后 hash 稳定、内容篡改、错误密钥与无效公钥。
- 修改公开契约时同步检查 `src/index.ts` 导出、相邻单元测试，以及 plugin CLI 的实际消费方式。
- 修改端口全集时还需运行 contracts 的机械同步测试；本包测试不能替代该跨端闸门。
