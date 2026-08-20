# @agentloom/plugin-cli

AgentLoom 插件开发 CLI，提供 `create`、`dev`、`build`、`keys` 和 `publish`。

## 安全与生命周期

- `loadPlugin()` 使用 `@agentloom/plugin-sdk` 的 `CustomNodeDefinitionSchema` 逐节点校验，拒绝缺失 execute 和重复 node type。
- `build` 遇到插件加载错误时失败，不生成空节点归档。
- dev execute body 只接受 `inputs` / `config`，logger 与 execution metadata 由服务端注入。
- dev JSON body 上限 100kb。
- dev 在启动、停止和 reload 时执行 activate/deactivate 生命周期；reload 失败恢复旧插件。

## 开发

```bash
pnpm --filter @agentloom/plugin-cli build
pnpm --filter @agentloom/plugin-cli typecheck
pnpm --filter @agentloom/plugin-cli test
```

完整命令与归档约定见 `AGENTS.md`。
