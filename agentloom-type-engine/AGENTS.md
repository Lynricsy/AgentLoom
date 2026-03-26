# AGENTLOOM TYPE ENGINE 知识库

Rust WASM 端口兼容性检查器。判断工作流画布中两个节点的端口是否可连接。

## 模块结构

```
src/
├── lib.rs              # 入口, pub mod 声明, #![deny(clippy::unwrap_used)]
├── types/
│   ├── port.rs         # PortDataType (10 variants), PortDirection, PortDefinition
│   ├── schema.rs       # TypeSchema = Scalar|Object|Array (custom serde)
│   └── constraint.rs   # TypeConstraint (6 variants) — 已定义但未在 checker 中强制执行
├── checker/
│   └── compatibility.rs  # 核心: CompatibilityChecker (563L)
├── validator/
│   └── schema_validator.rs  # TypeSchema 校验 (depth limit 12)
└── wasm/
    ├── bindings.rs     # 3 个 WASM 导出函数
    └── error.rs        # WasmError → TypeEngineError JS class
```

## WASM 导出

| 函数 | 输入 | 输出 | 用途 |
|------|------|------|------|
| `checkCompatibility` | source: JsValue, target: JsValue | CompatibilityResult | 端口间完整兼容性检查 |
| `checkSchemaCompatibility` | source: JsValue, target: JsValue | SchemaCompatibilityResult | Schema 级别兼容性 |
| `validateSchema` | input: JsValue | ValidationResult | 单个 Schema 校验 |

## 兼容性算法

**4 级结果**: `EXACT > TRANSFORM > PARTIAL > INCOMPATIBLE`

- **EXACT**: 类型完全匹配
- **TRANSFORM**: 可安全转换 (e.g., Text ↔ Json)
- **PARTIAL**: 部分字段匹配 (字段相似度阈值 0.55/0.85，最多 6 候选)
- **INCOMPATIBLE**: 无法连接

`ComparisonState` 防循环引用。`PortDataType` 10 种: model/text/json/image/audio/tool/sandbox/knowledge/skill/agent。

## 构建

```bash
# 测试
cargo test

# 基准测试
cargo bench                       # criterion, compatibility_bench

# 构建 WASM (产物在 pkg/)
wasm-pack build --target bundler --release

# Release 优化: opt-level=z + LTO (最小 WASM 体积)
```

**pkg/ 已提交到 git** — 包含 .wasm + .js bindings + .d.ts

## 测试

- `tests/` — 13 checker + 7 validator + 5 WASM browser tests
- `benches/` — criterion 基准测试 (compatibility_bench)
- WASM 测试: `wasm-bindgen-test`

## 约定

- `#![deny(clippy::unwrap_used)]` — 禁止 unwrap，使用 Result/Option 处理
- Rust Edition 2024，`crate-type = ["cdylib", "rlib"]`（同时输出 WASM 动态库和 Rust 静态库供测试链接）
- Serde 用于 JSON 序列化 (serde-wasm-bindgen 跨 WASM 边界)
- `TypeConstraint` 已定义但为死代码（未在 checker 中使用）
- 集成测试含 inline timing assert（`elapsed().as_millis() < 100`），确保兼容性检查不退化

## 对齐约束

4 级兼容性结果与 10 种 PortDataType 为 canonical 定义，在以下 4 处独立维护，存在漂移风险：

1. **Rust type-engine** — `src/types/port.rs`
2. **Server schema** — Drizzle enum + Zod
3. **Studio mcpToolMapping** — `features/canvas/types/typeSchema.ts`（含 legacy `number`/`boolean → json` 回退）
4. **Plugin SDK** — `src/types/port.ts`

修改任一处后需同步其余三处。

## 与 Studio 的关系

Studio 在 `features/canvas/types/typeSchema.ts` 中手动镜像了 Rust 类型。
Studio 通过 `TypeEngineService → TypeEngineRuntime → runtime.worker.ts` 接入 WASM，主线程保留同步 guard/cache 读取，慢检查走单例 worker + cache + 受控 fallback（`connectionCompatibility.ts`）。
修改 Rust 类型后需同步更新 Studio 的 TypeScript 镜像。
