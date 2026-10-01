---
docType: howto
---

# 运行与编写测试

本页回答两件事：提交前该跑哪些测试、怎样只跑一部分；新写的测试应该放在哪里、按什么模式写。

前置条件：已按 [搭建本地开发环境](/dev/setup) 在仓库根执行过 `pnpm install`。server 的 E2E 测试需要本机 Docker 可用（Testcontainers 会自己拉起 PostgreSQL 容器）。Rust、Go、Flutter 包需要各自的工具链：`cargo`、Go 1.25、FVM 管理的 Flutter。

server 的 `pnpm typecheck` 会连带检查 `agentloom-server/test/sandbox-container.e2e-spec.ts` 引用的 `agentloom-deploy/sandbox/src`，而 `agentloom-deploy/sandbox` 是独立 npm 包、不在 pnpm workspace 内。首次运行前在该目录安装依赖，否则会报 `Cannot find module 'fastify'` 等 TS2307：

```bash
cd agentloom-deploy/sandbox && npm install
```

## 提交前跑全量

仓库根的 `pnpm test:all` 先运行 `pnpm docs:check`（文档参考漂移守卫），再执行 `pnpm -r run test`，覆盖 `pnpm-workspace.yaml` 中有 `test` 脚本的 JS 包：`agentloom-server`、`agentloom-studio`、`agentloom-contracts`、`agentloom-plugin-sdk`、`agentloom-plugin-cli`、`agentloom-plugin-template`。它不包含 Rust、Go、Flutter，也不包含 server 的 E2E；改到这些部分时单独运行对应命令（见下文）。

```bash
pnpm typecheck:all && pnpm test:all
```

全部包通过时退出码为 0。不允许留下失败的测试：任何失败都视为本次改动引入的回归，查到根因修复，不跳过、不删除断言。

## 只跑一部分

### JS 包（Vitest 4）

在包目录下把文件路径或名称片段直接写在 `pnpm test` 后面。**不要加 `--`**：实测 `pnpm test -- <path>` 在 server 与 plugin-sdk 中不会过滤，而是跑全量。

```bash
cd agentloom-server
pnpm test src/common/filters
```

输出末尾：

```text
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

在仓库根用 `--filter` 跑整个包：

```bash
pnpm --filter @agentloom/contracts test
```

```text
 Test Files  5 passed (5)
      Tests  229 passed (229)
```

### server 的 E2E

E2E 是例外：`pnpm test:e2e` 经 `agentloom-server/scripts/run-e2e.mjs` 调用 `vitest run --config vitest.e2e.config.mts`，脚本会去掉开头的 `--`，所以按模式过滤要写成：

```bash
cd agentloom-server
pnpm test:e2e -- guard-chain
```

### 覆盖率

```bash
cd agentloom-server
pnpm test:cov
```

server 的覆盖率阈值在 `agentloom-server/vitest.config.mts`：statements、branches、functions、lines 均为 80，统计范围 `src/**/*.ts`，排除 `main.ts`、`*.spec.ts`、`*.dto.ts`、`*.schema.ts` 与迁移目录。低于阈值时命令失败。Studio 的 `pnpm test:coverage` 只出报告，不设阈值。

### 非 JS 包

| 包 | 命令（在包目录执行） | 框架 |
| --- | --- | --- |
| `agentloom-type-engine/` | `cargo test`；基准 `cargo bench`；WASM 集成测试 `wasm-pack test --node` | cargo test、Criterion、wasm-bindgen-test |
| `agentloom-firecracker-runtime/` | `go test ./...` | Go 标准库 testing |
| `agentloom_mobile/` | `flutter test`（FVM 环境用 `fvm flutter test`）；单文件 `flutter test test/features/auth/providers/auth_provider_test.dart` | flutter_test + mocktail |

`agentloom-type-engine/tests/` 中的 WASM 集成测试在 `cargo test` 下显示为 0 个用例，只有 `wasm-pack test --node` 才会执行。

## 测试放在哪里

| 包 | 位置与命名 |
| --- | --- |
| server 单测 | 与源码同目录的 `*.spec.ts`，或同级 `__tests__/` |
| server E2E | `agentloom-server/test/*.e2e-spec.ts` |
| Studio、contracts、plugin 包 | 与源码同目录的 `*.test.ts` / `*.test.tsx` |
| mobile | `agentloom_mobile/test/` 镜像 `lib/` 的 feature 结构，文件名 `*_test.dart` |
| type-engine | `agentloom-type-engine/tests/` 与 `agentloom-type-engine/benches/` |

## 按模式写测试

### server：数据库与 RLS

E2E 在 `beforeAll` 中用 `@testcontainers/postgresql` 启动 `postgres:16-alpine`，读取 `agentloom-server/src/database/migrations` 下的 SQL，按 `--> statement-breakpoint` 切分后逐条执行，得到与生产一致的表结构与 RLS 策略。涉及租户隔离的用例复用 `agentloom-server/test/rls/rls-test-utils.ts`：`createRlsTestContext` 建库，`withTenantContext` / `withoutTenantContext` 切换租户上下文，`seedOrg`、`seedMember`、`seedWorkflowDefinition` 等函数准备数据，`cleanupTables` 清表。

### server：mock

- 模块级 mock 用 `vi.hoisted()` 声明 mock 对象，再在 `vi.mock()` 工厂中引用，保证提升后的工厂能拿到同一个对象。示例：`agentloom-server/src/common/guards/__tests__/ws-jwt.guard.spec.ts`。
- Drizzle 链式调用（`select().from().where()`）用 `mockReturnThis()` 让每一环返回自身，最后一环返回结果。示例：`agentloom-server/src/common/services/__tests__/rbac-cache.service.spec.ts`。

### Studio

`agentloom-studio/vite.config.ts` 的 `test` 段配置 jsdom 环境、`globals`、单测超时 10000 毫秒，`setupFiles` 指向 `agentloom-studio/src/test-setup.ts`。该文件补齐 jsdom 缺少的浏览器 API（如 `ResizeObserver`），并全局 mock 主题 hook、Supabase 客户端与 `react-pdf`。新测试需要这些依赖时不要再各自 mock。

### 契约测试

- `agentloom-contracts/src/fixtures.test.ts` 用契约 schema 校验 `agentloom-contracts/fixtures/` 下的 server wire JSON。改了 wire 格式，同时更新 fixture。
- `agentloom-contracts/src/port-data-type.test.ts` 机械比对四端的端口数据类型字面量，任何一端改动而其他端未同步都会失败。

细节见 [契约与再生成](/dev/contracts)。

### mobile

provider 单测用 `ProviderContainer` 覆盖依赖并在 `tearDown` 中释放；mocktail 的自定义参数类型在 `setUpAll` 中 `registerFallbackValue`；公共 mock 与 DTO 工厂集中在 `agentloom_mobile/test/helpers/test_helpers.dart`。autoDispose provider 的异步状态测试要用 `container.listen(...)` 保持订阅，否则 provider 在等待期间被释放。
