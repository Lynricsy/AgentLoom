# @agentloom/plugin-cli

插件开发 CLI（命令 `agentloom-plugin`）：`create`、`keys`、`dev`、`build`、`publish`。

入口 `src/cli.ts` 只调用 `src/program.ts` 的 `runCli()`：命令抛出的错误统一打印为一行 `✖ <message>`（不带 Node 堆栈），退出码 1。`create` 在 stdin/stdout 不是终端时不弹提示，需要 `--author` 与 `--description`（`--license` 默认 `MIT`）。

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
