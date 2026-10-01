# @agentloom/plugin-cli

插件开发 CLI（命令 `agentloom-plugin`）：`create`、`keys`、`dev`、`build`、`publish`。

## 开发命令

依赖安装在仓库根执行一次 `pnpm install`；以下命令在 `agentloom-plugin-cli/` 内运行。

```bash
pnpm typecheck
pnpm test
pnpm test:watch
pnpm build       # tsup
pnpm dev         # tsup --watch
```

## 文档

- CLI 参考：`agentloom-docs/api/plugins/cli.md`
- 插件开发教程：`agentloom-docs/api/plugins/tutorial.md`
