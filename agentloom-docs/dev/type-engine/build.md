# 构建指南

本文档介绍如何构建、测试和维护类型引擎的 WASM 产物。

## 前置依赖

| 工具                       | 版本要求               | 说明                                       |
| -------------------------- | ---------------------- | ------------------------------------------ |
| **Rust**                   | stable（Edition 2024） | `rustup default stable`                    |
| **wasm-pack**              | ≥ 0.12                 | `cargo install wasm-pack`                  |
| **wasm32-unknown-unknown** | —                      | `rustup target add wasm32-unknown-unknown` |

## 构建 WASM

```bash
cd agentloom-type-engine

# 构建 bundler 目标（供 Vite/Webpack 打包器使用）
wasm-pack build --target bundler --release
```

构建完成后，产物输出到 `pkg/` 目录：

```text
pkg/
├── agentloom_type_engine_bg.wasm       # WASM 二进制（LTO + opt-level=z 压缩）
├── agentloom_type_engine.js            # JS 胶水代码
├── agentloom_type_engine.d.ts          # TypeScript 类型声明
├── agentloom_type_engine_bg.wasm.d.ts  # WASM 绑定类型声明
└── package.json                        # npm 包描述
```

### Release 优化配置

`Cargo.toml` 中的 Release Profile 配置了极致的体积优化：

```toml
[profile.release]
opt-level = "z"   # 最小体积优化
lto = true         # 链接时优化（跨 crate 内联）
```

- `opt-level = "z"` — 优先减小 WASM 二进制体积
- `lto = true` — 启用完整 LTO，消除未使用代码

## 运行测试

```bash
cd agentloom-type-engine

# 运行全部 Rust 单元测试
cargo test

# 运行特定测试模块
cargo test checker::compatibility::tests
cargo test validator::schema_validator::tests
cargo test wasm::bindings::tests
```

### 关键测试覆盖

| 测试模块                  | 覆盖范围                                      |
| ------------------------- | --------------------------------------------- |
| `compatibility::tests`    | 9 种类型两两兼容性、Schema 递归比较、转换规则 |
| `schema_validator::tests` | 合法/非法 Schema、深度限制、约束校验          |
| `bindings::tests`         | WASM 绑定序列化/反序列化、错误处理            |

## 运行基准测试

```bash
cd agentloom-type-engine

# 运行 Criterion 基准测试
cargo bench
```

基准测试使用 [Criterion.rs](https://github.com/bheisler/criterion.rs)，报告输出到 `target/criterion/`。

## 产物管理

::: warning 重要：pkg/ 已提交到 Git
类型引擎的 WASM 产物（`pkg/` 目录）**已提交到代码仓库**，而非在 CI/CD 中构建。

原因：

1. 项目当前无 CI/CD 流水线
2. 确保 Studio 开发者无需安装 Rust 工具链即可启动前端开发
3. WASM 产物变更频率低，手动构建可控

**更新流程：**

1. 修改 `src/` 中的 Rust 源码
2. 运行 `cargo test` 确保测试通过
3. 运行 `wasm-pack build --target bundler --release` 重新构建
4. 将 `pkg/` 目录变更一起提交
   :::

## Crate 结构

```text
agentloom-type-engine/
├── src/
│   ├── lib.rs                  # 入口：4 个公共模块声明
│   ├── checker/
│   │   ├── mod.rs              # checker 模块入口
│   │   └── compatibility.rs    # 核心兼容性检查器（~563 行）
│   ├── types/
│   │   ├── mod.rs
│   │   ├── port.rs             # PortDataType 枚举 + PortDefinition
│   │   └── schema.rs           # TypeSchema 三变体 + 自定义序列化
│   ├── validator/
│   │   ├── mod.rs
│   │   └── schema_validator.rs # Schema 校验器（~198 行）
│   └── wasm/
│       ├── mod.rs
│       ├── bindings.rs         # 3 个 WASM 导出函数（~151 行）
│       └── error.rs            # WasmError → TypeEngineError 映射
├── benches/                    # Criterion 基准测试
├── pkg/                        # WASM 构建产物（已提交）
└── Cargo.toml                  # 依赖与构建配置
```

## 依赖清单

| 依赖                 | 版本    | 用途                    |
| -------------------- | ------- | ----------------------- |
| `wasm-bindgen`       | 0.2.114 | Rust ↔ JS 绑定          |
| `serde`              | 1       | 序列化/反序列化         |
| `serde_json`         | 1       | JSON 处理               |
| `serde-wasm-bindgen` | 0.6     | Serde ↔ JsValue 桥接    |
| `js-sys`             | 0.3     | JavaScript 内置对象绑定 |
| `wasm-bindgen-test`  | 0.3     | WASM 测试框架（dev）    |
| `criterion`          | 0.5     | 基准测试框架（dev）     |

## 下一步

- [架构与兼容性规则](./architecture) — 了解兼容性算法的实现细节
- [WASM API 参考](./api) — 查看导出函数的完整签名和示例
