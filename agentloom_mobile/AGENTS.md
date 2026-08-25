# Repository Guidelines

## Project Overview

`agentloom_mobile` 是 AgentLoom 的 Flutter 移动客户端，面向认证、工作流浏览与启动、执行监控、Agent 对话、通知、Memory 和资源管理。客户端通过 Dio 调用 REST，通过 Socket.IO 消费执行与对话实时事件；服务端 wire 契约及跨包约束见根目录 `AGENTS.md`。

技术栈固定为 Flutter 3.41.2、Dart `^3.11.0`、Riverpod 3、GoRouter 17、Dio、Freezed/json_serializable、Firebase Messaging 与 mocktail。

## Architecture & Data Flow

```text
main.dart
  → 加载 .env.<ENV> 与安全存储中的运行时 Studio 地址
  → ProviderScope 注入环境和 FlutterSecureStorage
  → AgentLoomApp
  → goRouterProvider / feature screens
  → feature provider → feature API → shared Dio client → server REST
                     ↘ Socket.IO service → live provider state
```

- `lib/main.dart` 默认读取编译时 `ENV=dev`，加载 `.env.dev`；无效环境名由 `AppEnvironment.fromString` 回退为 `dev`。
- `EnvConfig.studioBaseUrl` 是连接配置来源；`apiBaseUrl` 由其派生。运行时覆盖地址保存在安全存储中。
- `apiClientProvider` 创建 Dio 并安装 `AuthInterceptor`。拦截器附加 Bearer token，以 `QueuedInterceptorsWrapper` 串行处理并发 401；刷新后必须同时更新安全存储和 `authProvider` 内存态。
- REST DTO 在解析边界递归归一 JSON key；Socket.IO 事件保持服务端 camelCase，不套用 REST 的 snake_case 兼容策略。
- `lib/routes/app_router.dart` 用认证状态刷新 redirect。`StatefulShellRoute.indexedStack` 保留 Dashboard、Workflows、Agents、Resources、Settings 五个标签页状态。

## Key Directories

```text
lib/
├── app/                 # MaterialApp.router 与五标签 Shell
├── config/              # 环境、主题、常量
├── routes/              # GoRouter 配置与 RouteNames
├── features/
│   └── <feature>/
│       ├── api/         # Dio REST 封装
│       ├── models/      # DTO、Freezed 状态和值对象
│       ├── providers/   # Riverpod 状态与数据加载
│       ├── screens/     # 页面和路由入口
│       ├── widgets/     # feature 私有组件
│       └── services/    # Socket/通知等长生命周期服务（按需）
└── shared/              # 跨 feature 的 models/providers/interceptors/utils/widgets
```

- 现有 feature：`auth`、`dashboard`、`workflows`、`execution`、`agents`、`notifications`、`memory`、`resources`、`settings`、`skills`。
- `resources/` 按 `api/models/providers/screens` 分层，覆盖 workspace、sandbox、knowledge base、MCP 与 LLM；共享 DTO 从 `models/resource_dtos.dart` 导出。
- `test/` 镜像 `lib/` 的 feature 结构；跨域 mock 与 DTO 工厂集中在 `test/helpers/test_helpers.dart`。

## Development Commands

在 `agentloom_mobile/` 执行；使用 FVM 时将 `flutter` 替换为 `fvm flutter`：

```bash
flutter pub get
flutter run --dart-define=ENV=dev
flutter run --dart-define=ENV=staging
flutter run --dart-define=ENV=prod
dart run build_runner build --delete-conflicting-outputs
dart run flutter_launcher_icons
flutter analyze
flutter test
flutter test test/features/auth/providers/auth_provider_test.dart
flutter test --coverage
```

`.env.dev`、`.env.staging`、`.env.prod` 均在 `pubspec.yaml` 中声明为 assets。不要把凭据、token 或私有测试账号写入源码、测试 fixture 或文档。

## Code Conventions & Common Patterns

- Dart 文件使用 `snake_case.dart`，类型用 PascalCase，变量和 provider 用 lowerCamelCase；遵循邻近代码的 import 分组与命名。
- `analysis_options.yaml` 启用 strict casts、strict raw types、single quotes、`prefer_final_locals`、`avoid_print` 等规则；生成的 `*.g.dart` 与 `*.freezed.dart` 不参与 analyzer。
- Riverpod 使用手写 `Notifier` / `AsyncNotifier`，不引入 `riverpod_generator`。参数化状态采用 `AsyncNotifierProvider.family`，需要随路由释放时使用 `autoDispose.family`。
- family 的复合 query key 必须是不可变值对象，并完整实现逐字段 `==` 与 `hashCode`；否则 Widget rebuild 会不断创建不同 key 并重复请求。
- notifier 中每次 `await` 后、写 `state` 或访问已注册资源前检查 `ref.mounted`。并发请求还应沿用现有 request-version 守卫，避免旧响应覆盖新状态。
- 列表追加页状态使用 `items`/`entries`、`isLoadingMore`、`loadMoreError`；追加失败保留已有数据，首屏失败继续由 `AsyncValue.error` 表达。
- 屏幕通过 provider 读取服务端实体，不用 `FutureBuilder` 建第二份缓存。mutation 成功后 invalidate 精确的 list/detail family key。
- DTO 通常用 `@freezed`，声明同名 `.freezed.dart` 与 `.g.dart` part，并提供 `fromJson`；只含内存状态的 union 可仅生成 Freezed 文件。
- 修改 Freezed/json_serializable 模型后运行 build_runner；生成文件是派生产物，不手工编辑。
- `normalizeJsonKeys` / `normalizeJsonMap` 是 REST JSON 的统一递归 snake_case → camelCase 入口。同层双键冲突时 camelCase 值优先；兼容逻辑放在 DTO/API 解码边界，不散落到字段读取处。
- 资源响应由 `resource_envelope_decoder.dart` 严格验证 object/list/envelope；缺字段或类型错误抛 `ApiContractException`，禁止用空列表、空字符串伪造成功。
- execution Socket 模型使用 camelCase 字段，禁止添加 `FieldRename.snake`。REST detail 提供初始 snapshot，Socket 事件推进实时状态，断连链路可转 polling fallback。
- 导航统一使用 `RouteNames` 与 `goNamed`/声明式 route；新增受保护页面时同时考虑 router redirect、嵌套路由位置与路径参数。

## Important Files

- `.fvmrc` — Flutter `3.41.2` 固定版本。
- `pubspec.yaml` — SDK、依赖、环境 assets 与 launcher icon 配置。
- `lib/main.dart` — dotenv、Firebase、安全存储和根 ProviderScope 启动入口。
- `lib/app/app.dart` — 应用主题、GoRouter 和登录后推送初始化。
- `lib/routes/app_router.dart` — 认证 redirect、顶层页面与五标签路由树。
- `lib/config/env.dart` — 环境枚举、Studio 地址规范化与 API 地址派生。
- `lib/shared/providers/api_client_provider.dart` — 共享 Dio 客户端。
- `lib/shared/interceptors/auth_interceptor.dart` — token 注入、刷新与强制登出。
- `lib/shared/utils/json_key_normalizer.dart` — REST key 递归归一。
- `test/helpers/test_helpers.dart` — 公共 mock 与测试数据工厂。

## Runtime/Tooling Preferences

- 使用 `.fvmrc` 对应的 Flutter 3.41.2，不以本机其他 Flutter 版本更新 lockfile 或生成代码。
- 环境仅通过 `--dart-define=ENV=<dev|staging|prod>` 选择；不传时为 dev。
- 持久 token 与运行时服务器地址走 `flutter_secure_storage`；普通业务状态留在 Riverpod。
- Firebase 未配置或当前平台不支持推送时，应用仍应可启动，推送保持禁用。

## Testing & QA

- 测试使用 `flutter_test` + mocktail。API/provider mock 优先复用 `test/helpers/test_helpers.dart`，特定协议对象可在测试文件中定义 `Mock implements ...`。
- provider 单测用 `ProviderContainer` 覆盖依赖，并通过 `addTearDown(container.dispose)` 或 `tearDown` 释放；Widget 复用已有 container 时使用 `UncontrolledProviderScope`。
- mocktail 的非空自定义参数在 `setUpAll` 中 `registerFallbackValue`；异步 stub 使用 `thenAnswer((_) async => ...)`。
- autoDispose provider 的异步错误或状态转换测试应以 `container.listen(...)` 保持生命周期，不能只触发一次读取后等待。
- 测 observable 行为：认证转换与 token 同步、router redirect、分页失败保留数据、REST/Socket wire 解析、provider family key 值相等语义及 Widget 交互。
- 测试文件按源码域放在 `test/features/<feature>/..._test.dart`；共享配置与工具测试分别位于 `test/config/`、`test/shared/`。
