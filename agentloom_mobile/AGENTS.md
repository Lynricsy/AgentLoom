# agentloom_mobile 知识库

## 概览

AgentLoom Flutter 移动端应用，当前实现 Story 7.3 + 7.3a + 7.4 + 7.4a：

- Riverpod ProviderScope 启动入口
- GoRouter + `StatefulShellRoute.indexedStack` 三标签导航 (Dashboard / Workflows / Settings)
- Dio API Client Provider（含 AuthInterceptor 自动附加 Bearer + 401 刷新重试）
- dotenv 环境切换（dev / staging / prod）
- 完整认证链路：LoginScreen → AuthApi → AuthNotifier → TokenStorage (flutter_secure_storage)
- GoRouter redirect guard：未认证 → /login，已认证 + /login → /dashboard
- 工作流列表页（搜索、状态筛选、下拉刷新、无限滚动）
- 工作流详情页（元数据卡片、执行历史、FAB 运行按钮）→ 点击执行记录跳转执行监控
- Dashboard 页（快速访问工作流、最近执行）→ 点击最近执行跳转执行监控
- 执行监控：Socket.IO 实时状态 + REST 5s 轮询降级，状态头 + 告警横幅 + 步骤时间线

## 目录约定

```text
lib/
├── app/                 # 应用壳与根 Widget (AppWidget, ShellScaffold)
├── config/              # 环境、主题、常量
├── features/
│   ├── auth/
│   │   ├── api/         # AuthApi (独立 Dio, 无 AuthInterceptor 循环) + authDioProvider
│   │   ├── models/      # Freezed: AuthTokens, AuthState (sealed), LoginUser
│   │   ├── providers/   # AuthNotifier (login/logout/refresh/forceLogout) + TokenStorage
│   │   ├── screens/     # LoginScreen (email/password + 验证 + 错误/MFA/加载态)
│   │   └── widgets/     # AuthTextField (可复用, 密码可见性切换)
│   ├── dashboard/
│   │   ├── providers/   # recentWorkflowsProvider
│   │   ├── screens/     # DashboardScreen
│   │   └── widgets/     # RecentExecutionsSection (onExecutionTap callback), QuickAccessSection, RecentExecutionCard
│   ├── execution/
│   │   ├── models/      # Freezed: ExecutionEventEnvelope, ExecutionStateSnapshot, StepSnapshot, ExecutionStatus/StepStatus enums, SubscribeAck
│   │   ├── services/    # ExecutionSocketService (Socket.IO /execution namespace, JWT auth, subscribe/unsubscribe, event streams)
│   │   ├── providers/   # ExecutionMonitorNotifier (AsyncNotifier.family, sealed state machine, WS→polling fallback)
│   │   ├── screens/     # ExecutionMonitorScreen (ConsumerStatefulWidget, watches executionMonitorProvider)
│   │   └── widgets/     # ExecutionStatusHeader, ExecutionAlertBanner, StepTimeline, StepTimelineItem, ConnectionModeIndicator
│   ├── settings/
│   │   └── screens/     # SettingsScreen (占位)
│   └── workflows/
│       ├── api/         # WorkflowApi (Dio wrapper: list/get/executions/run/getExecution) + workflowApiProvider
│       ├── models/      # Freezed: WorkflowDefinitionDto, ExecutionSummaryDto
│       ├── providers/   # WorkflowListNotifier, workflowDetailProvider, workflowExecutionsProvider
│       ├── screens/     # WorkflowsScreen (列表), WorkflowDetailScreen (详情)
│       └── widgets/     # WorkflowCard, WorkflowStatusChip, ExecutionSummaryTile
├── routes/              # go_router 配置 (含 AuthRouteNotifier redirect guard, /executions/:executionId 顶层路由) 与路由名
└── shared/
    ├── interceptors/    # AuthInterceptor (QueuedInterceptorsWrapper, 401 刷新 + 重试)
    ├── models/          # PaginatedResponse<T> + PaginationMeta
    ├── providers/       # apiClientProvider (Dio + AuthInterceptor), envProvider
    └── widgets/         # 共享组件（预留）
```

## 命令

使用 FVM 执行（项目固定 Flutter 3.41.2）：

```bash
fvm flutter pub get
fvm flutter analyze
fvm dart run build_runner build --delete-conflicting-outputs
fvm flutter test
fvm flutter test --coverage
```

## 数据层模式

- **Freezed 3.x**: 模型使用 `abstract class` + `@freezed` + `@JsonKey(name: 'snake_case')` 进行 JSON 序列化
- **PaginatedResponse\<T\>**: 泛型分页封装，`@JsonSerializable(genericArgumentFactories: true)`
- **WorkflowApi**: 封装 Dio 调用，方法签名与服务端 REST 端点一一对应
- **Riverpod 3.x**: 手写 Provider（无 riverpod_generator），AsyncNotifier 用于列表状态管理，FutureProvider.family 用于详情获取
- **搜索防抖**: WorkflowListNotifier 内置 300ms debounce（Timer），支持 setSearchQuery / setStatusFilter / loadMore / refresh

## 测试模式

- **298 个测试** 覆盖 models/api/providers/widgets/screens/routes/auth/execution
- Provider 错误测试使用 `container.listen()` + `Completer<void>` 模式避免 Riverpod 3.x dispose StateError
- Widget/Screen 测试使用 `UncontrolledProviderScope` 配合 `ProviderContainer`
- Mock: `mocktail` 库，测试工厂函数集中在 `test/helpers/test_helpers.dart`
- AuthInterceptor 测试使用自定义 capturing handler 断言 `next/resolve/reject`，避免 `runZonedGuarded` 隐藏真实回归
- AuthProvider 测试需 `registerFallbackValue(testTokens)` for mocktail `any()` matcher

## 当前注意事项

- `envProvider` 在 `main.dart` 中通过 `ProviderScope.overrides` 注入真实环境
- `secureStorageProvider` 在 `main.dart` 中通过 `ProviderScope.overrides` 注入 `FlutterSecureStorage()` 实例
- AuthApi 使用独立 `authDioProvider` (无 AuthInterceptor) 避免循环依赖
- AuthInterceptor 处理 4 种 401 type: `token-expired` (刷新重试), `token-revoked`/`token-invalid`/`token-missing` (强制登出)；若检测到其他请求已完成 refresh，会直接复用最新 token 重试，避免重复 refresh
- GoRouter redirect guard 通过 `AuthRouteNotifier` (ChangeNotifier) 桥接 Riverpod authProvider，并统一等待 `authProvider.future` 完成后再判断首屏路由，避免 storage/provider 双源竞态
- `TokenStorage.hasTokens()` 与 `readTokens()` 一致，要求 access/refresh/expires_in 三项完整，避免残缺凭证误判为已登录
- Android `AndroidManifest.xml` 已关闭 `allowBackup`，避免安全存储内容进入系统备份
- OAuth、MFA UI、注册页面不在 7-3a 范围内，已留 TODO 占位
- FCM、深色主题均为后续 Story 的 TODO 占位
- `.env.*` 已在 `pubspec.yaml` 声明为 Flutter assets，供 `flutter_dotenv` 加载
- WorkflowDetailScreen 在 `.when()` 前检查 `hasError && !hasValue` 以兼容 Riverpod 3.x 的 `AsyncLoading(error: ...)` 中间状态
- **Story 7-4a 已完成**: 执行监控与实时状态更新。`features/execution/` 完整实现：`ExecutionStatus`(6值)/`StepStatus`(8值) 枚举含 color/icon/label/isTerminal getters；`ExecutionEventEnvelope`/`ExecutionStateSnapshot`/`StepSnapshot`/`SubscribeAck` Freezed 模型；`ExecutionSocketService` 连接 Socket.IO `/execution` namespace（JWT auth + `['websocket']` transport + `emitWithAckAsync` subscribe + 7 个 StreamController 广播流 + `dispose()` 释放）；`ExecutionMonitorNotifier`（`AsyncNotifier.family` keyed on executionId）实现 sealed 状态机 Loading→Connected→Polling→Error→Disconnected，REST 初始快照 → WS subscribe（ACK 含 currentState）→ 事件处理 → 断连 5s 轮询降级 → 重连 re-subscribe with lastEventId → 终态自动清理；`socketServiceFactoryProvider` 支持测试注入。路由 `/executions/:executionId` 在 Shell 外（无底部导航栏），支持深链接。WorkflowDetailScreen 执行列表 onTap 跳转、DashboardScreen 最近执行 onTap 跳转。126 个新增测试（298 总计）
