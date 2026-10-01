# Repository Guidelines

## 概述

插件作者与宿主之间的公共边界：manifest、节点与执行上下文类型、运行时校验、端口 helper、`.alp` 归档签名。面向外部插件生态，改公开类型、校验行为、canonical payload 或导出路径按兼容性变更处理。跨包规则见根 `AGENTS.md`。
SDK 参考：`agentloom-docs/api/plugins/sdk.md`。

## 本包硬规则

- `package.json` 直接依赖 `zod: ^3.23.0`，不用 workspace catalog 的 Zod 4。
- 公共入口只经各目录 `index.ts` 逐层导出；新增公共符号接入 barrel，内部 helper 不意外暴露。
- 公共边界接收不可信值用 `unknown`、schema 或类型守卫，不用 `any`。
- `validateManifest()` 用 `safeParse()`，返回 `{ valid, errors }`（带路径的错误字符串），不抛普通校验错误。
- object schema 默认 `.strip()` 未知字段；改为 strict/passthrough 前先确认 CLI 与既有插件兼容。
- `defineNode()` 只做 `Object.freeze()` 浅冻结，不假定嵌套结构已冻结。
- manifest ID 用 reverse-domain，版本用 semver；签名哈希与密钥指纹为 64 字符小写 SHA-256 hex。
- `src/types/port.ts` 的端口镜像先改 contracts 再同步；保持 `portDataTypes` 为可提取的字面量数组形状（contracts 测试会解析它）。
- 签名对象是 canonical JSON descriptor 而非 ZIP 字节：manifest 去掉 `signature`/`contentHash`/`developerKeyFingerprint` 后递归排序键（数组保序）；路径规范化并拒绝空、`.`、`..` 与重复；其余文件按路径排序记录 SHA-256。签名元数据写回 manifest 后 canonical hash 必须不变。
- `signArchive()` 用 SHA-256 + RSA-PSS（salt 长度 = digest）；`verifyArchiveSignature()` 对无效输入返回 `false` 而非抛错。

## 命令

见本包 `README.md`。

## 改动时更新

公开 API、manifest 字段或签名格式变化 → 更新 `agentloom-docs/api/plugins/sdk.md`（必要时 `cli.md`、`tutorial.md`）。
