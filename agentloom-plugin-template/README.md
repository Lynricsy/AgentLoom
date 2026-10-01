# agentloom-plugin-template

基于 `@agentloom/plugin-sdk` 的示例插件（`Text to Uppercase`，manifest id `com.agentloom.text-to-uppercase`）：把输入文本转为大写，可选前缀与后缀。用作插件结构与测试写法的参考；新插件建议用 `agentloom-plugin create` 生成。

## 开发命令

依赖安装在仓库根执行一次 `pnpm install`；以下命令在 `agentloom-plugin-template/` 内运行。

```bash
pnpm typecheck
pnpm test        # vitest，src/index.test.ts
pnpm build       # tsc → dist/
pnpm dev         # agentloom-plugin dev，本地调试服务器
```

## 文档

- 插件开发教程：`agentloom-docs/api/plugins/tutorial.md`
- SDK 参考：`agentloom-docs/api/plugins/sdk.md`
