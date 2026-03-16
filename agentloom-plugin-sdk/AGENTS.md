# AGENTLOOM PLUGIN SDK 知识库

TypeScript 插件开发 SDK。提供插件 manifest 类型、节点执行接口、Zod 3 校验器、端口/节点辅助函数与 RSA-PSS 签名工具。

## 模块结构

```
src/
├── index.ts                  # 根 barrel，统一导出 types/validation/helpers/signing
├── types/
│   ├── port.ts               # canonical 8 PortDataType + PortDefinition
│   ├── manifest.ts           # PluginManifest / PluginPermission / NodeCategory
│   ├── execution.ts          # NodeExecutionContext / NodeExecutionResult / PluginLogger
│   ├── node.ts               # CustomNodeDefinition
│   ├── plugin.ts             # AgentLoomPlugin 生命周期接口
│   └── index.ts              # types barrel
├── validation/
│   ├── manifest-schema.ts    # PluginManifestSchema + reverse-domain / semver 校验
│   ├── node-schema.ts        # PortDefinitionSchema + CustomNodeDefinitionSchema
│   ├── validate-manifest.ts  # safeParse 包装，返回 ValidationResult
│   ├── *.test.ts             # manifest / node schema 校验测试
│   └── index.ts              # validation barrel
├── helpers/
│   ├── port-helpers.ts       # defineInputPort / defineOutputPort / defineNode
│   ├── type-guards.ts        # isPortDataType / isValidPermission / isPluginManifest
│   ├── *.test.ts             # helper 与 type guard Vitest 单测
│   └── index.ts              # helpers barrel
└── signing/
    ├── sign.ts               # computeContentHash (SHA-256 hex) + signArchive (RSA-PSS+SHA-256)
    ├── verify.ts             # verifyArchiveSignature (失败时返回 false 而非抛异常)
    ├── signing.test.ts       # sign/verify Vitest 单测
    └── index.ts              # signing barrel
```

## 构建产物

- `dist/index.js` — ESM 入口
- `dist/index.cjs` — CJS 入口
- `dist/index.d.ts` — ESM 类型声明
- `dist/index.d.cts` — CJS 类型声明

`package.json` 仅发布 `dist/`，由 `tsup` 从 `src/index.ts` 统一构建。本地 `file:` 依赖通过 `prepare` / `prepack` 自动生成 `dist/`，供 sibling packages 直接解析包入口。

## 在哪找什么

| 任务 | 位置 | 备注 |
|------|------|------|
| 调整插件 manifest 字段或权限 | `src/types/manifest.ts` + `src/validation/manifest-schema.ts` | 权限枚举与 Zod 规则需同步 |
| 修改端口 canonical 类型 | `src/types/port.ts` | 必须保持 `model|text|json|image|audio|tool|sandbox|knowledge` |
| 增加节点接口或执行上下文 | `src/types/node.ts` / `src/types/execution.ts` | public API 只暴露 `unknown`，不暴露 `any` |
| 扩展校验返回结构 | `src/validation/validate-manifest.ts` + `src/validation/validate-manifest.test.ts` | `validateManifest()` 输出 `ValidationResult`，direct test 验证 safeParse 包装 |
| 添加开发者辅助函数 | `src/helpers/` | 同步补 Vitest 覆盖 |
| 补充 SDK 单测 | `src/validation/*.test.ts` + `src/helpers/*.test.ts` | 使用 Vitest，覆盖 schema / helper / type guard |
| 签名/验证插件归档 | `src/signing/sign.ts` + `src/signing/verify.ts` | RSA-PSS SHA-256，node:crypto 内置，无额外依赖 |

## 约定

- 使用 **Zod 3.x**，不要引入 Zod 4 API
- `PluginManifest.id` 使用 reverse-domain 格式，如 `com.example.my-plugin`
- `version` 与 `minPlatformVersion` 通过 `semver.valid()` 校验
- `permissions` 默认空数组；未知 manifest 字段由 Zod object 默认 strip
- `PluginManifest` 可选签名字段：`signature`（RSA-PSS base64）、`contentHash`（SHA-256 hex 64字符）、`developerKeyFingerprint`（SHA-256 hex 64字符）、`wasmEntry`、`sandbox`
- `defineNode()` 只做 identity + `Object.freeze()`，不做深冻结
- 公开接口与类型守卫避免暴露 `any`

## 测试与命令

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Vitest 测试位于 `src/**/*.test.ts`。`tsconfig.json` 开启 `strict`，`moduleResolution` 为 `Bundler`，运行时产物由 `tsup` 负责输出到 `dist/`。

## 对齐约束

- PortDataType 与主仓 server/studio/type-engine 的 canonical 8 值保持一致
- 该包是 standalone npm package，拥有独立 `node_modules/` 与 `pnpm-lock.yaml`
- 不依赖其他 AgentLoom 包；通过导出类型与运行时校验作为插件生态边界
