# agentloom-plugin-cli 知识库

`@agentloom/plugin-cli` 提供插件创建、开发、构建、密钥管理和发布命令。

## 目录

```text
src/
├── cli.ts
├── index.ts
├── commands/
│   ├── create.ts
│   ├── dev.ts
│   ├── build.ts
│   ├── keys.ts
│   └── publish.ts
└── utils/
    ├── manifest.ts
    └── plugin.ts
```

CLI 是根 pnpm workspace 成员，通过 `workspace:*` 依赖 `@agentloom/plugin-sdk`。

## 插件加载

`src/utils/plugin.ts` 的 `loadPlugin()`：

- 校验 package/manifest，并保留完整 manifest。
- 每个节点先剥离不可序列化的 `execute`，再用 SDK `CustomNodeDefinitionSchema.safeParse()` 校验其余定义。
- 校验错误包含节点 index 与 type，便于定位。
- 拒绝缺失 `execute` 的节点。
- 拒绝同一插件内重复 node type。
- 返回包含 manifest、nodes、`activate()`、`deactivate()` 的 `RuntimePlugin`。

`build` 依赖该加载链；加载或节点校验错误直接使构建失败，并保留原始 cause，不用空 nodeDefinitions 继续打包。

## Dev server

`src/commands/dev.ts` 使用 Express，默认端口 4400：

- JSON body 上限 100kb。
- execute 请求体只读取 `inputs` 与 `config`。
- logger 由 dev server 注入。
- `executionId`、`stepId`、`nodeId` metadata 使用服务端生成的 UUID；客户端同名字段不可信也不透传。
- 启动时调用插件 `activate()`，停止时调用 `deactivate()`。
- reload 顺序为旧插件 deactivate → 加载候选 → 候选 activate。
- 候选加载或 activate 失败时重新 activate 旧插件并保留旧节点；旧插件恢复也失败时报告组合错误。
- 文件监听 reload 串行化，避免并发替换 active plugin。

## 归档与签名

`build` 生成 `.alp` ZIP；`keys` 管理 RSA 密钥；`publish` 使用 SDK canonical payload/RSA-PSS helper 签名并上传。归档中的 manifest、dist 和 package metadata 必须通过 SDK 校验。

## 命令

```bash
pnpm --filter @agentloom/plugin-cli build
pnpm --filter @agentloom/plugin-cli typecheck
pnpm --filter @agentloom/plugin-cli test
```

CLI 子命令：`create`、`dev`、`build`、`keys`、`publish`。可执行入口为 `agentloom-plugin`。
