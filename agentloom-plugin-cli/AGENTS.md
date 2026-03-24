# agentloom-plugin-cli 知识库

`@agentloom/plugin-cli` — AgentLoom 插件开发 CLI 工具。Commander.js 驱动，5 个子命令覆盖插件全生命周期。

## 目录结构

```
agentloom-plugin-cli/
├── src/
│   ├── cli.ts              # 入口：Commander program 注册 5 个子命令
│   ├── index.ts            # 公共 API barrel export
│   ├── commands/
│   │   ├── create.ts       # `create` — 交互式脚手架（prompts），从模板目录生成新插件项目
│   │   ├── dev.ts          # `dev` — Express 开发服务器 (:4400)，chokidar 文件监听 + 热重载
│   │   ├── build.ts        # `build` — 打包插件为 `.alp` 归档（archiver），含 manifest 校验
│   │   ├── keys.ts         # `keys` — RSA 密钥对管理（生成/列表），用于插件签名
│   │   └── publish.ts      # `publish` — 签名 + 上传 `.alp` 到 AgentLoom 服务端注册
│   └── utils/
│       ├── manifest.ts     # 插件 manifest 解析与校验
│       └── plugin.ts       # 插件目录操作工具函数
├── tsup.config.ts          # tsup 构建配置
└── vitest.config.ts        # Vitest 测试配置
```

## 命令

| CLI 子命令 | 说明 |
|-----------|------|
| `create` | 交互式创建新插件项目（prompts 问答驱动） |
| `dev` | 启动 Express 开发服务器 (:4400) + chokidar 文件监听热重载 |
| `build` | 校验 manifest → 打包为 `.alp` 归档 (archiver) |
| `keys` | RSA 密钥对管理（generate/list），用于 `.alp` 签名 |
| `publish` | 使用 RSA-PSS 签名 `.alp` → 上传到服务端 `/plugins` 注册 |

可执行入口：`bin.agentloom-plugin` → `dist/cli.js`

## 技术栈

- **Commander.js** ^12 — CLI 框架
- **prompts** — 交互式问答
- **archiver** ^7 — `.alp` 归档打包
- **chokidar** ^3 — 文件监听（dev 模式）
- **Express** ^4 — 开发服务器
- **chalk** ^5 — 终端彩色输出
- **@agentloom/plugin-sdk** — 本地 file: 依赖，提供签名工具函数
- **tsup** ^8 + **Vitest** ^2 — 构建与测试

## 测试

每个命令一个 `.test.ts`（与源码同目录），manifest 工具也有测试。共 5 个测试文件。

## 注意事项

- ESM 模式（`"type": "module"`）
- 依赖 `@agentloom/plugin-sdk` 通过 `file:../agentloom-plugin-sdk` 本地链接
- 签名使用 SDK 的 `signing/` 模块提供的 RSA-PSS 工具函数
- `.alp` 格式为 archiver 生成的归档，包含插件 WASM bundle + manifest + 签名
