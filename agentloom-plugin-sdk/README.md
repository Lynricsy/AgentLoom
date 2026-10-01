# @agentloom/plugin-sdk

AgentLoom 插件开发 SDK：manifest 与节点定义类型、执行上下文、Zod 3 校验器、端口 helper 与 RSA-PSS 归档签名工具。本包固定使用 Zod 3.x（插件生态兼容），不引用 workspace 的 zod catalog。

## 开发命令

依赖安装在仓库根执行一次 `pnpm install`；以下命令在 `agentloom-plugin-sdk/` 内运行。

```bash
pnpm typecheck
pnpm test
pnpm build       # tsup；prepare/prepack 也会构建 dist/
```

## 文档

- SDK 参考：`agentloom-docs/api/plugins/sdk.md`
- 插件开发教程：`agentloom-docs/api/plugins/tutorial.md`
