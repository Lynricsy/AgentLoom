# Repository Guidelines

## 概述

Rust/WASM 端口 data type 与 schema 兼容性引擎；只判断兼容性，不负责连线方向/容量（Studio 同步守卫）、画布拓扑或持久化。跨包规则见根 `AGENTS.md`。
架构、导出接口与兼容规则：`agentloom-docs/dev/type-engine.md`。

## 本包硬规则

- Rust 标识符 snake_case；serde wire 字段输出 camelCase，`CompatibilityLevel` 输出 SCREAMING_SNAKE_CASE。
- crate 根 `#![deny(clippy::unwrap_used)]`；错误路径用 `Result`、`Option` 或结构化 `WasmError`，不用 `unwrap()`。
- `TypeSchema` 的 object/array 只允许 `json` kind，scalar 不允许 `json` kind；新增 shape 或兼容规则时同步 checker、serde round-trip 与测试。
- `CompatibilityResult` 的 `reason`、`conflictPath`、`transformFn`、metadata 与 Studio `TypeEngineCompatibilityResult` 契约保持一致。
- 端口类型与变换规则是四端契约：先改本包，再同步 `agentloom-contracts/src/port-data-type.ts` / `port-compatibility.ts`，由 contracts 测试机械校验。
- `pkg/` 是提交到仓库的 WASM 产物，改动 `src/` 后用 `wasm-pack build --target bundler --release` 重新生成并一起提交。
- 性能验证放 Criterion benchmark；正确性测试不依赖 wall-clock 阈值。
- `cargo test` 不运行 `#[wasm_bindgen_test]`，WASM 边界测试必须另跑 `wasm-pack test --node`。

## 命令

见本包 `README.md`。

## 改动时更新

导出接口或兼容规则变化 → 更新 `agentloom-docs/dev/type-engine.md`；端口类型变化 → 仓库根 `pnpm docs:gen`。
