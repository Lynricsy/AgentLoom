# AGENTLOOM TYPE ENGINE 知识库

Rust/WASM 端口与 schema 兼容性检查器。

## 模块

```text
src/
├── lib.rs
├── types/
│   ├── port.rs          # PortDataType、PortDirection、PortDefinition
│   └── schema.rs        # Scalar/Object/Array schema
├── checker/
│   └── compatibility.rs # schema 与端口连接检查
├── validator/
│   └── schema_validator.rs
└── wasm/
    ├── bindings.rs
    └── error.rs
```

仓库没有 `constraint` 模块。性能测量归属 `benches/compatibility_bench.rs`，正确性测试不使用 wall-clock 阈值。

## PortDataType

`PortDataType` 包含 14 个 serde lowercase 变体：

`model | text | json | array | image | audio | tool | sandbox | knowledge | skill | agent | memory | exec | volume`

canonical 全集定义在 `@agentloom/contracts` 的 `PORT_DATA_TYPES`。Rust 镜像位于 `src/types/port.rs`；`agentloom-contracts/src/port-data-type.test.ts` 读取 Rust、plugin SDK、Studio、server 源文件，检查各端是 contracts 子集且各端并集等于 canonical 全集。

## 检查语义

`CompatibilityChecker::check()` 只做 data type/schema 兼容性，返回 `EXACT | TRANSFORM | PARTIAL | INCOMPATIBLE`，不判断端口拓扑。

`check_port_connection()` 在 schema 检查前验证连接上下文：

1. source direction 必须是 `Output`。
2. target direction 必须是 `Input`。
3. optional source（`required=false`）不能连接 required target。
4. `multiple=false` 的端口容量固定为 1。
5. `multiple=true` 且设置 `max_connections` 时使用该上限；达到 source 或 target 容量均拒绝连接。
6. 上述条件满足后再执行纯 schema 兼容性检查。

调用方必须传入 source/target 的已有连接数；不能用 `check()` 替代连接级验证。

## WASM API

- `checkCompatibility`
- `checkSchemaCompatibility`
- `validateSchema`

`pkg/` 是 wasm-pack 输出，包含 WASM、JS bindings 与类型声明。

## 命令

```bash
cargo test
cargo bench
wasm-pack build --target bundler --release
```

Rust Edition 2024，crate 同时输出 `cdylib` 与 `rlib`。crate 根使用 `#![deny(clippy::unwrap_used)]`，错误路径用 Result/Option 表达。
