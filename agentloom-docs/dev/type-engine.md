---
docType: reference
---

# 类型引擎

`agentloom-type-engine/` 是 Rust 编写、经 `wasm-bindgen` 编译为 WASM 的端口兼容性检查器：给定源端口与目标端口的定义，返回能否连线、需要什么转换、缺哪些字段。它只判断 data type 与 schema；端口方向、`multiple`/`maxConnections` 容量等连接级约束由 Studio 画布的同步守卫处理，画布拓扑与持久化也不在本包内。Studio 侧如何加载与调用见 [画布编辑器](/dev/studio/canvas)。

## 端口数据类型与兼容矩阵

端口数据类型的唯一定义是 `agentloom-contracts/src/port-data-type.ts` 的 `PORT_DATA_TYPES`；`agentloom-type-engine/src/types/port.rs` 的 `PortDataType` 枚举是 Rust 镜像（serde 序列化为小写），由 `agentloom-contracts/src/port-data-type.test.ts` 机械校验，见 [契约与代码生成](/dev/contracts)。

数据类型级的兼容矩阵只由两条规则决定：同类型恒为可连（随后进入 schema 级比较，可能降级），跨类型只有命中转换规则时可连。下表由生成器从 contracts 的 `isPortDataTypeCompatible` 与 `PORT_DATA_TYPE_TRANSFORM_RULES` 算出：

<!--@include: ../_generated/port-data-types.md-->

## 转换规则

权威表在 `agentloom-type-engine/src/checker/compatibility.rs` 的 `CompatibilityChecker::default()`；`agentloom-contracts/src/port-compatibility.ts` 的 `PORT_DATA_TYPE_TRANSFORM_RULES` 是它的 wire 镜像，server 执行期守卫与 Studio 画布同步守卫从镜像派生，`agentloom-contracts/src/port-compatibility.test.ts` 逐条比对两边（含顺序）。

| 源 → 目标 | `reason_key` / `reasonKey` | `transform_fn` / `transformFn` |
| --- | --- | --- |
| `text` → `json` | `text_to_json_parse` | `parse_json` |
| `json` → `text` | `json_to_text_stringify` | `stringify_json` |
| `skill` → `text` | `skill_to_text_degrade` | `extract_skill_text` |

`json` 与 `array` 之间没有转换规则。新增规则先改 Rust、重建 `pkg/`，再改 contracts 镜像。

## 兼容等级

`CompatibilityLevel`（`agentloom-type-engine/src/checker/compatibility.rs`）序列化为 SCREAMING_SNAKE_CASE：

| 等级 | 判定条件 |
| --- | --- |
| `EXACT` | 目标 schema 的全部单元都匹配，没有缺失字段，没有用到转换 |
| `TRANSFORM` | 全部单元匹配，且至少一处经转换规则匹配；`transformFn` 为第一处转换的函数名 |
| `PARTIAL` | 部分单元匹配或存在缺失字段；`reason` 为 `partial_field_match` |
| `INCOMPATIBLE` | 没有任何单元匹配且无缺失字段（类型不同又无转换、shape 不同、标量 schema 不同、数组基数冲突） |

`INCOMPATIBLE` 的 `reason` 取值：`type_mismatch_no_transform`、`shape_mismatch`、`scalar_schema_mismatch`、`array_cardinality_mismatch`。`conflictPath` 以 `root` 开头，类型冲突以 `.kind` 结尾、shape 冲突以 `.shape` 结尾、数组基数冲突以 `.minItems`/`.maxItems` 结尾。

## Schema 级比较

端口未携带 `schema` 时，`CompatibilityChecker::check()` 按端口的 `dataType`、`description` 生成一个标量 schema，`nullable` 取 `!required`。schema 有三种形状（`agentloom-type-engine/src/types/schema.rs`）：

| 形状 | 反序列化条件 | 比较方式 |
| --- | --- | --- |
| Scalar | 无 `shape`，或 `kind` 不是 `json` | 整个结构体相等才算匹配；`format`、`title`、`description`、`nullable`、`examples` 任一不同即 `scalar_schema_mismatch` |
| Object | `kind: "json"` 且 `shape: "object"` | 遍历目标 `properties`：同名字段递归比较，缺失字段记入 `missingFields` |
| Array | `kind: "json"` 且 `shape: "array"`（缺 `items` 反序列化失败） | 先比基数：源 `minItems` 小于目标或源 `maxItems` 大于目标即不兼容；再递归比较 `items` |

`kind: "json"` 但缺少 `shape` 时反序列化为 Scalar，结构信息丢失。

### 候选映射与阈值

存在缺失字段时，checker 对源 schema 的每条字段路径与每个缺失字段计算相似度（`field_similarity`，只看路径最后一段，去掉非字母数字并转小写）：

| 情况 | 相似度 |
| --- | --- |
| 路径完全相同 | 1.0 |
| 归一化后相同 | 0.95 |
| 一方包含另一方 | 0.8 |
| 其他 | 词元重叠比例 |

阈值写在 `agentloom-type-engine/src/checker/compatibility.rs` 的 `build_candidate_mappings`：相似度低于 `0.55` 的候选丢弃；不低于 `0.85` 的候选 `autoRecommended: true`；按相似度降序后只保留前 6 条。`PARTIAL` 结果的 `metadata` 含 `matchedRatio`、`matchedRequiredCount`、`totalRequiredCount`、`unmappedRequiredCount`。

## WASM 接口

`agentloom-type-engine/src/wasm/bindings.rs` 只导出一个函数，`agentloom-type-engine/pkg/agentloom_type_engine.d.ts` 中的声明为：

```typescript
export function checkCompatibility(source: any, target: any): any;
```

### 入参

`source`、`target` 可以是对象或 JSON 字符串，按 `PortDefinition`（`agentloom-type-engine/src/types/port.rs`，camelCase）反序列化：

| 字段 | 类型 | 必填 |
| --- | --- | --- |
| `id` | string | 是 |
| `label` | string | 是 |
| `direction` | `input` \| `output` | 是 |
| `dataType` | 端口数据类型 | 是 |
| `description` | string | 否 |
| `required` | boolean | 是 |
| `multiple` | boolean | 是 |
| `maxConnections` | number | 否 |
| `schema` | TypeSchema | 否 |

`direction`、`multiple`、`maxConnections` 会被解析，但 checker 不读取它们。

### 返回值

`CompatibilityResult`（camelCase）：`level`、`reason`、`missingFields`（`path`、`expectedType`、`required`）、`candidateMappings`（`sourcePath`、`targetPath`、`confidence`、`autoRecommended`）、`conflictPath`、`transformFn`、`metadata`。

### 错误

解析或序列化失败时抛出 `Error`，`name` 为 `TypeEngineError`，带 `code` 与可选 `context`（`agentloom-type-engine/src/wasm/error.rs`）：

| `code` | 触发条件 |
| --- | --- |
| `NULL_INPUT` | 参数为 `null` |
| `EMPTY_INPUT` | 参数为 `undefined` 或空白字符串 |
| `STRINGIFY_FAILED` | 对象无法 `JSON.stringify` |
| `INVALID_PORT_DEFINITION` | JSON 不符合 `PortDefinition` |
| `SERIALIZATION_FAILED` | 结果无法序列化回 JavaScript |

## 构建产物

`pkg/` 是 `wasm-pack build --target bundler --release` 的输出，虽然 `agentloom-type-engine/.gitignore` 含 `/pkg*`，这些文件已被 git 跟踪，Studio 开发不需要 Rust 工具链。`git ls-files agentloom-type-engine/pkg` 的输出：

```text
agentloom-type-engine/pkg/.gitignore
agentloom-type-engine/pkg/agentloom_type_engine.d.ts
agentloom-type-engine/pkg/agentloom_type_engine.js
agentloom-type-engine/pkg/agentloom_type_engine_bg.js
agentloom-type-engine/pkg/agentloom_type_engine_bg.wasm
agentloom-type-engine/pkg/agentloom_type_engine_bg.wasm.d.ts
agentloom-type-engine/pkg/package.json
```

Studio 的 `agentloom-studio/src/features/canvas/lib/typeEngine/runtime.worker.ts` 在 Web Worker 中实例化 `agentloom_type_engine_bg.wasm`；worker 不可用时 `agentloom-studio/src/features/canvas/lib/typeEngine/service.ts` 改用 `agentloom-studio/src/features/canvas/lib/typeEngine/fallback.ts` 的 TypeScript 实现。修改兼容语义时 Rust 与 fallback 必须同步。

`agentloom-type-engine/Cargo.toml` 的 release profile 为 `opt-level = "z"`、`lto = true`；crate 类型为 `cdylib` 与 `rlib`，edition 2024。crate 根启用 `#![deny(clippy::unwrap_used)]`。

## 命令

在 `agentloom-type-engine/` 下执行：

| 命令 | 作用 |
| --- | --- |
| `cargo test` | 原生 Rust 测试（`tests/checker_tests.rs`、`tests/wasm_integration_tests.rs`）；不统计 `#[wasm_bindgen_test]` |
| `wasm-pack test --node` | 在 Node 中运行 `#[wasm_bindgen_test]`，覆盖 `checkCompatibility` 的入参、返回与结构化错误 |
| `cargo bench` | Criterion 基准 `benches/compatibility_bench.rs`，只观察性能 |
| `wasm-pack build --target bundler --release` | 重建 `pkg/`；改动 Rust/WASM 边界后必须执行并提交 `pkg/` |

2026-10-01 在本仓库运行 `cargo test` 的摘要输出：

```text
     Running unittests src/lib.rs (target/debug/deps/agentloom_type_engine-0b7befaac7d0f87e)
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running tests/checker_tests.rs (target/debug/deps/checker_tests-3ee9908ff69bea55)
test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
     Running tests/wasm_integration_tests.rs (target/debug/deps/wasm_integration_tests-a7478716e0ca8205)
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
   Doc-tests agentloom_type_engine
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

`tests/wasm_integration_tests.rs` 在原生 harness 下为 0 个用例，它的用例只在 `wasm-pack test --node` 中运行。
