# @agentloom/plugin-sdk

AgentLoom 插件开发 SDK，提供插件 manifest、节点定义、执行上下文、Zod 3 校验器、端口 helper 和 RSA-PSS 归档签名工具。

## PortDataType

SDK 支持 14 种端口数据类型：

`model | text | json | array | image | audio | tool | sandbox | knowledge | skill | agent | memory | exec | volume`

canonical 全集来自 `@agentloom/contracts`；contracts 测试机械检查 SDK、server、Studio 和 Rust type-engine 镜像的同步关系。

## 开发

```bash
pnpm --filter @agentloom/plugin-sdk build
pnpm --filter @agentloom/plugin-sdk typecheck
pnpm --filter @agentloom/plugin-sdk test
```

SDK 固定使用 Zod 3.x。`prepare` 与 `prepack` 会构建 `dist/`。公共 API 和签名格式见 `AGENTS.md`。
