# Repository Guidelines

## 概述

插件脚手架、开发服务器、归档与签名工具（命令 `agentloom-plugin`，也经 `dist/index.js` 暴露可编程 API），以 `@agentloom/plugin-sdk` 为生态边界。跨包规则见根 `AGENTS.md`。
CLI 参考：`agentloom-docs/api/plugins/cli.md`。

## 本包硬规则

- ESM + 严格 TypeScript + 同步 Node 文件 API；公共能力导出「纯函数 + options/result interface」，Commander action 只做参数适配与输出。
- 新命令放 `src/commands/<name>.ts`，导出 `<name>Command`，需要复用的函数与类型同时从 `src/index.ts` 暴露。
- 错误信息包含可行动的路径、节点 index/type 或缺失前置条件；不得以空节点或未校验数据继续归档。
- `loadPlugin()` 用 SDK 的 `CustomNodeDefinitionSchema` 逐节点校验，拒绝缺失 execute 与重复 node type。
- `dev` 的 execute 请求只采纳 `inputs`、`config`（logger 与 execution metadata 由服务端生成），JSON body 上限 `100kb`。
- reload 串行：旧插件 deactivate → 加载并 activate 候选，失败恢复旧插件；停止时关闭 watcher、HTTP server 并 deactivate。
- TypeScript 构建归档 `manifest.json`、`dist/`、`package.json`、可选 `README.md` 与非空 `node-definitions.json`；WASM 构建产物规范为 `dist/plugin.wasm`。

## 命令

见本包 `README.md`。

## 改动时更新

命令、参数或输出变化 → 更新 `agentloom-docs/api/plugins/cli.md` 与 `tutorial.md`（输出样例需重新实跑）。
