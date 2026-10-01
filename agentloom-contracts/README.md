# @agentloom/contracts

server / Studio / mobile 共享的 wire 契约（Zod 4 schema 与类型）唯一来源，并附带三端 contract test 共用的 `fixtures/`。内容清单、再生成流程与四端同步测试见 `agentloom-docs/dev/contracts.md`。

## 开发命令

依赖安装在仓库根执行一次 `pnpm install`；以下命令在 `agentloom-contracts/` 内运行。

```bash
pnpm typecheck
pnpm test        # 含 fixtures.test.ts 与 port-data-type.test.ts 四端镜像同步检查
pnpm build       # tsup；prepare/prepack 也会构建
```

## 文档

- 契约内容与改动流程：`agentloom-docs/dev/contracts.md`
- 端口数据类型参考：`agentloom-docs/guide/getting-started/index.md`
