# agentloom-type-engine

Rust/WASM 端口类型兼容性引擎，Studio 画布在 Web Worker 中加载它判定连线兼容性。`pkg/` 下的 WASM 构建产物已提交到仓库。

## 开发命令

在 `agentloom-type-engine/` 内运行：

```bash
cargo test                                   # 原生 Rust 测试（不含 #[wasm_bindgen_test]）
wasm-pack test --node                        # WASM 边界测试（Node 模式）
cargo bench                                  # Criterion 基准（benches/compatibility_bench.rs）
wasm-pack build --target bundler --release   # 重新生成 pkg/
```

## 文档

- 架构、导出接口与兼容规则：`agentloom-docs/dev/type-engine.md`
