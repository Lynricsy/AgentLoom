---
docType: explanation
---

# Flutter 应用

移动端 `agentloom_mobile/` 怎样组织代码、怎样连接 server、在哪些地方必须和 server 的 wire 格式对齐？本页解释这些机制，并列出读代码时的入口。用户能在手机上做什么见 [移动端功能](/guide/mobile/features)。

## 技术栈与工具链

- Flutter 版本固定在 `agentloom_mobile/.fvmrc`（FVM 管理），Dart SDK 约束见 `agentloom_mobile/pubspec.yaml`。不要用本机其他 Flutter 版本更新 lockfile 或生成代码。
- 状态：Riverpod 3，手写 `Notifier` / `AsyncNotifier`，不使用 `riverpod_generator`。
- 路由：GoRouter。网络：Dio（REST）与 socket_io_client（实时）。
- 模型：`@freezed` + json_serializable，生成文件 `*.freezed.dart`、`*.g.dart` 不手改。
- 推送：Firebase Messaging；Firebase 未配置或平台不支持时应用照常启动，推送保持禁用。
- 测试：`flutter_test` + mocktail，见 [运行与编写测试](/dev/testing)。

开发命令写在 `agentloom_mobile/README.md`。

## 启动链

```text
lib/main.dart
  → 按编译期 ENV（默认 dev）加载 .env.<ENV>，读取安全存储中的运行时 Studio 地址
  → ProviderScope 注入环境配置与 FlutterSecureStorage
  → lib/app/app.dart：MaterialApp.router、主题、登录后初始化推送
  → lib/routes/app_router.dart：认证 redirect 与五标签路由树
  → feature provider → feature API → 共享 Dio 客户端 → server REST
                     ↘ Socket 服务 → provider 实时状态
```

| 文件 | 作用 |
| --- | --- |
| `agentloom_mobile/lib/main.dart` | 入口：dotenv、Firebase、安全存储、根 `ProviderScope` |
| `agentloom_mobile/lib/config/env.dart` | 环境枚举；从 `.env` 读取 Studio 地址并派生 API 地址 |
| `agentloom_mobile/lib/routes/app_router.dart` | GoRouter 配置、认证 redirect、`StatefulShellRoute` 五个分支 |
| `agentloom_mobile/lib/app/shell_scaffold.dart` | 导航壳：小屏底部 `NavigationBar`，大屏 `NavigationRail` |
| `agentloom_mobile/lib/shared/providers/api_client_provider.dart` | 共享 Dio 客户端 |
| `agentloom_mobile/lib/shared/interceptors/auth_interceptor.dart` | 注入 Bearer token；并发 401 串行刷新，刷新后同时更新安全存储与内存中的认证状态；刷新失败强制登出 |
| `agentloom_mobile/lib/shared/utils/json_key_normalizer.dart` | REST JSON 键递归归一为 camelCase |
| `agentloom_mobile/test/helpers/test_helpers.dart` | 公共 mock 与测试数据工厂 |

## 环境配置

编译时用 `--dart-define=ENV=dev|staging|prod` 选择环境，不传为 `dev`。三个文件 `agentloom_mobile/.env.dev`、`agentloom_mobile/.env.staging`、`agentloom_mobile/.env.prod` 在 `pubspec.yaml` 中声明为 assets，当前内容只有 Studio 地址与应用名，且三者的 Studio 地址都是生产地址：

```dotenv
# agentloom_mobile/.env.prod
STUDIO_BASE_URL=https://agentloom.ling.plus
APP_NAME=AgentLoom
```

`.env.dev` 与 `.env.staging` 只有应用名不同（`AgentLoom Dev`、`AgentLoom Staging`）。连接本地 server 时，在应用的服务器配置页（路由 `/server-config`）填写地址；该地址保存在 `flutter_secure_storage`，优先于 `.env`。

## 导航结构

`app_router.dart` 用 `StatefulShellRoute.indexedStack` 保留五个标签页各自的导航栈。标签名取自 `shell_scaffold.dart`：

| 标签 | 根路由 | 下级路由 |
| --- | --- | --- |
| 总览 | `/dashboard` | — |
| 工作流 | `/workflows` | `:workflowId`、`:workflowId/launch` |
| Agent | `/agents` | `:agentId` |
| 资源 | `/resources` | `skills`、`memory`、`workspaces`、`sandboxes`、`knowledge-bases`、`mcp-servers`、`llm-models` |
| 设置 | `/settings` | `change-password`、`mfa`、`sessions`、`preferences` |

标签之外的顶层路由：`/login`、`/register`、`/server-config`、`/auth/callback`、`/mfa-verify`、`/mfa-enroll`、`/executions/:executionId`（及步骤的 Agent 与输出子页）、`/agents/:agentId/conversations/new`、`/agents/:agentId/conversations/:conversationId`。新增受保护页面时同时检查 redirect、嵌套位置与路径参数，导航统一用 `RouteNames` + `goNamed`。

设置标签由六个屏组成，位于 `agentloom_mobile/lib/features/settings/screens/`：`settings_screen`、`change_password_screen`、`mfa_manage_screen`、`session_list_screen`、`preferences_screen`、`server_config_screen`。

记忆（资源 → 记忆）的屏位于 `agentloom_mobile/lib/features/memory/screens/`：`memory_list_screen`（记忆实例列表）、`memory_detail_screen`、`memory_node_screen`、`memory_audit_screen`、`memory_audit_detail_screen`。

## feature 目录

<!--@include: ../_generated/mobile-features.md-->

每个 feature 按需分层：`api/`（Dio 封装）、`models/`（DTO 与 Freezed 状态）、`providers/`（Riverpod）、`screens/`、`widgets/`，长生命周期服务放 `services/`（如 `agentloom_mobile/lib/features/execution/services/execution_socket_service.dart`）。`resources/` 覆盖工作区、沙箱、知识库、MCP 与 LLM，共享 DTO 从 `agentloom_mobile/lib/features/resources/models/resource_dtos.dart` 导出。`test/` 镜像 `lib/` 的 feature 结构。

## 与 server 的 wire 对齐

- **REST**：响应在 DTO/API 解码边界经 `normalizeJsonKeys` / `normalizeJsonMap` 统一递归转为 camelCase；同一层出现同义的 snake_case 与 camelCase 键时取 camelCase。兼容逻辑只放在解码边界。
- **契约违规不伪造成功**：资源响应由 `agentloom_mobile/lib/features/resources/models/resource_envelope_decoder.dart` 严格校验对象、列表与信封结构，缺字段或类型错误抛 `ApiContractException`，不返回空列表或空字符串。
- **Socket**：移动端连接 `/execution`（`execution_socket_service.dart`）与 `/agent-conversation`（`agentloom_mobile/lib/features/agents/providers/agent_conversation_provider.dart`）。Socket 事件是 server 的 camelCase 信封，模型不加 `FieldRename.snake`。执行详情先用 REST 快照初始化，再由 Socket 事件推进；断线时可退回轮询。事件定义见 [实时通信](/dev/server/realtime)，契约来源见 [契约与再生成](/dev/contracts)。

## 状态约定

- 参数化状态用 `AsyncNotifierProvider.family`，随路由释放的用 `autoDispose.family`；family 的复合 key 必须是不可变值对象并实现逐字段 `==` 与 `hashCode`，否则每次 rebuild 都会重新请求。
- notifier 中每次 `await` 之后、写 `state` 之前检查 `ref.mounted`；并发请求沿用现有 request-version 守卫，避免旧响应覆盖新状态。
- 屏幕通过 provider 读取服务端实体，不用 `FutureBuilder` 另建缓存；mutation 成功后失效精确的 list/detail family key。
- 分页追加失败保留已有数据（`isLoadingMore`、`loadMoreError`），首屏失败由 `AsyncValue.error` 表达。
- 持久 token 与运行时服务器地址存 `flutter_secure_storage`，其余业务状态留在 Riverpod。
