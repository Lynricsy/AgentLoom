# AgentLoom Type Engine

Rust/WASM 类型兼容性引擎，用于工作流端口 schema 检查和完整连接约束校验。

## 能力

- `CompatibilityChecker::check()`：纯 data type/schema 兼容性
- `check_port_connection()`：Output→Input 方向、optional→required、`multiple`/`max_connections` 容量和 schema 的组合校验
- 14 值 `PortDataType`，与 `@agentloom/contracts` 的 `PORT_DATA_TYPES` 同步
- wasm-bindgen 浏览器接口

## 开发

```bash
cargo test
wasm-pack test --node
cargo bench
wasm-pack build --target bundler --release
```
`cargo test` 只运行原生 Rust harness，不会统计 `#[wasm_bindgen_test]`；因此 WASM 边界测试必须单独用 Node 模式执行，无需浏览器环境。

性能基准位于 `benches/compatibility_bench.rs`。模块和契约细节见 `AGENTS.md`。
