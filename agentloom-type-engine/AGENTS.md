# Repository Guidelines

## Project Overview

`agentloom-type-engine` 是 AgentLoom 的 Rust/WASM 端口类型与 schema 兼容性引擎。它既提供原生 Rust API，也通过 `wasm-bindgen` 向 Studio 暴露浏览器 API；包内只判断 data type 与 schema 兼容性，不负责连接上下文（方向/容量由 Studio 同步守卫处理）、画布拓扑或持久化。

## Architecture & Data Flow

```text
PortDefinition / TypeSchema JSON
  → types 反序列化
  → checker 计算兼容性
  → CompatibilityResult
  → wasm/bindings.rs 转换为 JavaScript 对象
  → Studio Web Worker 调用已提交的 pkg/*.wasm
```

- `CompatibilityChecker::check()` / `check_compatibility()` 只比较 data type 与 schema；缺少显式 schema 时按端口 `data_type`、描述和 required 状态生成 scalar schema。
- WASM 只导出 `checkCompatibility`，不携带连接计数；端口方向、`multiple`/`max_connections` 容量等连接级约束由 Studio 侧同步守卫判定，本 crate 不再提供对应 API。

兼容性结果使用四个稳定等级：

- `EXACT`：类型及 schema 完全匹配，且不需要转换。
- `TRANSFORM`：全部目标单元可通过已注册转换处理；当前规则含 `text→json`、`json→text`、`skill→text`。
- `PARTIAL`：仅部分字段匹配或目标字段缺失；结果可含 `missingFields`、候选映射与匹配比例 metadata。
- `INCOMPATIBLE`：类型、shape、scalar schema、数组基数等无法兼容。

## Key Directories

- `src/types/port.rs`：`PortDataType`、`PortDirection`、`PortDefinition` 及 serde wire 命名。
- `src/types/schema.rs`：scalar/object/array schema；object 与 array 以 `kind: "json"` 配合 `shape` 区分。
- `src/checker/compatibility.rs`：等级判定、转换规则与字段候选映射。
- `src/wasm/bindings.rs`：JavaScript 入参解析、结构化错误和返回值序列化。
- `tests/`：checker 与 WASM 集成测试。
- `benches/compatibility_bench.rs`：Criterion 对象兼容性基准。
- `pkg/`：提交到仓库的 `wasm-pack` bundler 产物，包括 `.wasm`、JS glue、TypeScript declarations 与 package metadata。

## Development Commands

在 `agentloom-type-engine/` 下执行：

```bash
cargo test
wasm-pack test --node
cargo bench
wasm-pack build --target bundler --release
```

`Cargo.toml` 使用 Rust edition 2024；library 同时产出 `cdylib` 与 `rlib`。Criterion bench 设置 `harness = false`，release profile 使用 `opt-level = "z"` 和 LTO。

修改 Rust/WASM 边界后必须重新执行 bundler build，并将 `pkg/` 内生成的 WASM、JS 与声明文件一并保持同步；不要手改生成产物。

## Code Conventions & Common Patterns

- Rust 标识符使用 snake_case；wire 字段由 serde 输出 camelCase，`CompatibilityLevel` 输出 SCREAMING_SNAKE_CASE。
- crate 根启用 `#![deny(clippy::unwrap_used)]`；错误路径使用 `Result`、`Option` 或结构化 `WasmError`，不要用 `unwrap()`。
- `TypeSchema` 的 object/array 只允许 `json` kind；scalar 不允许 `json` kind。新增 shape 或兼容性规则时同步 checker、serde round-trip 与测试。
- 保持 `CompatibilityResult` 的 `reason`、`conflictPath`、`transformFn`、metadata 与 Studio `TypeEngineCompatibilityResult` 契约一致。
- 性能验证放在 Criterion benchmark；正确性测试不得依赖 wall-clock 阈值。

## Important Files

- `src/lib.rs`：公开 `checker`、`types`、`wasm` 模块，并禁止 clippy unwrap。
- `src/wasm/bindings.rs`：唯一 JavaScript 导出 `checkCompatibility(source, target)`。
- `Cargo.toml`：crate 类型、WASM/serde 依赖、Criterion bench 与 release profile。
- `pkg/agentloom_type_engine_bg.wasm`：Studio 实际加载的编译产物。
- `agentloom-studio/src/features/canvas/lib/typeEngine/runtime.worker.ts`：Web Worker 内直接实例化 WASM，优先 `instantiateStreaming`，失败时退回 `arrayBuffer`。
- `agentloom-studio/src/features/canvas/lib/typeEngine/service.ts`：worker runtime 不可用时调用本地 TypeScript compatibility fallback。

## Runtime/Tooling Preferences

`PortDataType` 的 canonical 集合在 `@agentloom/contracts`，当前 14 值为：

`model | text | json | array | image | audio | tool | sandbox | knowledge | skill | agent | memory | exec | volume`

`src/types/port.rs` 只是 Rust 镜像。增删值必须先更新 contracts，并同步 Studio、server、plugin SDK 与 Rust；跨包同步约束及机械校验入口见根 `AGENTS.md`。

Studio 通过 module Web Worker 隔离 WASM 加载和兼容性计算；runtime 管理请求超时、缓存、并发去重与 worker 重建。WASM 故障时 service 使用 `fallback.ts` 的本地实现，因此修改兼容性语义时必须同时核对 Rust 与 fallback，避免结果等级漂移。

## Testing & QA

- `cargo test` 覆盖原生 Rust 测试；`#[wasm_bindgen_test]` 不会被原生 harness 计数，必须另跑 `wasm-pack test --node` 覆盖 `checkCompatibility` 的输入输出与结构化错误。
- `cargo bench` 运行 `compatibility_bench`；仅用于观察性能，不承担正确性断言。
- 改动 WASM bindings 时运行 `wasm-pack test --node`，并核对 `pkg/agentloom_type_engine.d.ts` 只导出 `checkCompatibility` 及 Studio worker 的调用签名。
- 改动 14 值端口集合时运行 contracts 的跨包集合测试；改动兼容性算法时同时覆盖 Rust checker 与 Studio fallback 的同类场景。
