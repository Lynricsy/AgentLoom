# agentloom_mobile 知识库

## 概览

AgentLoom Flutter 移动端应用，当前实现 Story 7.3 + 7.3a + 7.4 + 7.4a + 7.5 + 7.6：

- Riverpod ProviderScope 启动入口
- GoRouter + `StatefulShellRoute.indexedStack` 三标签导航 (Dashboard / Workflows / Settings)
- Dio API Client Provider（含 AuthInterceptor 自动附加 Bearer + 401 刷新重试）
- dotenv 环境切换（dev / staging / prod）
- 完整认证链路：LoginScreen → AuthApi → AuthNotifier → TokenStorage (flutter_secure_storage)
- GoRouter redirect guard：未认证 → /login，已认证 + /login → /dashboard
- 工作流列表页（搜索、状态筛选、下拉刷新、无限滚动）
- 工作流详情页（元数据卡片、执行历史、FAB 运行按钮）→ 点击执行记录跳转执行监控
- 工作流启动页（`ParameterInputScreen`）：动态参数表单、空参数确认、conversation 模式 Web 引导
- Dashboard 页（快速访问工作流 + recentExecutions 聚合）→ 点击最近执行跳转执行监控
- 执行监控：Socket.IO 实时状态 + REST execution detail 5s 轮询降级，状态头 + 告警横幅 + 步骤时间线 + disconnected 语义纠正
- 推送通知：FCM token 生命周期管理、前台本地通知、后台/终止态深链导航到执行详情
- 工作流启动链路：`WorkflowDetailScreen` FAB → `/workflows/:workflowId/launch` → 参数提交 → `/executions/:executionId`

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
│   │   ├── providers/   # recentWorkflowsProvider + recentExecutionsProvider
│   │   ├── screens/     # DashboardScreen
│   │   └── widgets/     # RecentExecutionsSection, QuickAccessSection, RecentExecutionCard
│   ├── execution/
│   │   ├── models/      # Freezed: ExecutionEventEnvelope, ExecutionStateSnapshot, StepSnapshot, ExecutionStatus/StepStatus enums, SubscribeAck
│   │   ├── services/    # ExecutionSocketService (resolveExecutionSocketUrl + Socket.IO /execution namespace)
│   │   ├── providers/   # ExecutionMonitorNotifier (AsyncNotifierProvider.autoDispose.family, REST detail → snapshot + WS metadata merge)
│   │   ├── screens/     # ExecutionMonitorScreen (ConsumerStatefulWidget, watches executionMonitorProvider)
│   │   └── widgets/     # ExecutionStatusHeader, ExecutionAlertBanner, StepTimeline, StepTimelineItem, ConnectionModeIndicator
│   ├── notifications/
│   │   ├── api/         # DeviceApi (register/unregister + deviceApiProvider)
│   │   ├── models/      # Freezed: PushNotificationPayload (fromFcmData camelCase)
│   │   ├── services/    # NotificationService (FCM init/permission/token/foreground show/tap stream)
│   │   └── providers/   # PushNotificationNotifier (initializeAfterAuth/cleanupOnLogout/token dedup)
│   ├── settings/
│   │   └── screens/     # SettingsScreen (占位)
│   └── workflows/
│       ├── api/         # WorkflowApi (list/get/executions/run/getExecution/getInputSchema) + workflowApiProvider
│       ├── models/      # Freezed: WorkflowDefinitionDto, ExecutionSummaryDto, ExecutionStepDto, WorkflowInputSchema, InputFieldDefinition
│       ├── providers/   # WorkflowListNotifier, workflowDetailProvider, workflowExecutionsProvider, WorkflowLaunchNotifier
│       ├── screens/     # WorkflowsScreen, WorkflowDetailScreen, ParameterInputScreen
│       └── widgets/     # WorkflowCard, WorkflowStatusChip, ExecutionSummaryTile, input-field widgets, no-params/conversation prompts
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
- **PaginatedResponse<T>**: 泛型分页封装，`@JsonSerializable(genericArgumentFactories: true)`
- **WorkflowApi**: 封装 Dio 调用，方法签名与服务端 REST 端点一一对应；`getExecution()` 消费完整 execution detail `steps[]`，`getInputSchema()` 会对 `collectionMode`/`minLength`/`maxLength` 做 camelCase/snake_case 兼容归一化，`runWorkflow()` 发送 canonical camelCase `inputParams` / `launchSource`
- **Riverpod 3.x**: 手写 Provider（无 riverpod_generator），AsyncNotifier/FutureProvider 用于状态管理
- **execution monitor**: REST detail 建立初始 snapshot；WS ACK / plain snapshot 通过 metadata merge 保留 `nodeName/nodeType/startedAt/completedAt`；断连后 5 秒 polling fallback

## 测试模式

- **405 个测试** 覆盖 models/api/providers/widgets/screens/routes/auth/execution/dashboard/workflow-run/parameter-input/notifications
- Provider 错误测试使用 `container.listen()` + `Completer<void>` 模式避免 Riverpod 3.x dispose StateError
- Widget/Screen 测试使用 `UncontrolledProviderScope` 配合 `ProviderContainer`
- Mock: `mocktail` 库，测试工厂函数集中在 `test/helpers/test_helpers.dart`
- Dashboard recent executions 相关测试现在覆盖聚合、排序、区块渲染与 runWorkflow 导航

## 当前注意事项

- `envProvider` 在 `main.dart` 中通过 `ProviderScope.overrides` 注入真实环境
- `secureStorageProvider` 在 `main.dart` 中通过 `ProviderScope.overrides` 注入 `FlutterSecureStorage()` 实例
- AuthApi 使用独立 `authDioProvider` (无 AuthInterceptor) 避免循环依赖
- AuthInterceptor 处理 4 种 401 type: `token-expired` (刷新重试), `token-revoked`/`token-invalid`/`token-missing` (强制登出)
- GoRouter redirect guard 通过 `AuthRouteNotifier` (ChangeNotifier) 桥接 Riverpod authProvider，并统一等待 `authProvider.future` 完成后再判断首屏路由
- `TokenStorage.hasTokens()` 与 `readTokens()` 一致，要求 access/refresh/expires_in 三项完整
- `.env.*` 已在 `pubspec.yaml` 声明为 Flutter assets，供 `flutter_dotenv` 加载
- WorkflowDetailScreen 在 `.when()` 前检查 `hasError && !hasValue` 以兼容 Riverpod 3.x 的 `AsyncLoading(error: ...)` 中间状态
- **Story 7-4a 已完成**: 执行监控与实时状态更新。`ExecutionSocketService` 通过 `resolveExecutionSocketUrl()` 去掉 `/api`/`/api/v1` 后连接 `/execution`；`ExecutionMonitorNotifier` 使用 `AsyncNotifierProvider.autoDispose.family`，支持 execution detail `steps[]` → snapshot 映射、graph metadata 提取、ACK/WS snapshot metadata merge（含 reconnect ACK）、5s polling fallback、`lastEventId` 重新订阅与 terminal cleanup；`ConnectionMode` 现支持 `disconnected`，failed banner 显示失败节点名 + 错误摘要，timeline item 显示 `nodeName/nodeType` 并保留 `nodeId`；Dashboard 已新增 `recentExecutionsProvider`，7-4a 收尾时移动端全量测试为 307 passed。
- **Story 7-5 已完成**: `WorkflowDetailScreen` FAB 现先导航到 `ParameterInputScreen`；`WorkflowLaunchNotifier` 使用 `AsyncNotifierProvider.autoDispose.family` 拉取 schema 并在 submit 成功/失败路径使用 `ref.mounted` 防止 dispose 后写状态；参数页支持 text / number / single_select / multi_select 动态字段、客户端 required/min/max/minLength/maxLength 校验、空参数确认页与 conversation 模式 Web 引导；成功后通过 `context.goNamed(RouteNames.executionMonitor, ...)` 收口到执行监控页，避免回退到已提交表单；`WorkflowApi.getInputSchema()` 已兼容服务端 camelCase 与 legacy snake_case schema，移动端全量测试现为 370 passed。
- **Story 8-6 已完成自动化收口**: `InputFieldDefinition` 现支持 canonical `InputFieldVisibility { fieldId, equals }`（`fromJson()` 同时兼容 `fieldId/field_id`）；`WorkflowApi.getInputSchema()` 会归一化 field-level visibility，`runWorkflow()` 新增 `schemaVersion`，`WorkflowLaunchNotifier.submit()` 会透传 `schema.version` 并继续固定 `launchSource: 'mobile'`。`ParameterInputScreen` 现只渲染当前可见字段，显隐判断基于 `visibility.fieldId/equals` 递归求值，提交时仅收集可见字段，因此隐藏字段不会进入 payload；默认值会与用户输入协同，字段重新显示时继续保留本地输入，`collectionMode != 'form'` 则统一走现有 `ConversationModePrompt` fallback，避免吸收 8-6a 的 conversation/hybrid 范围。移动端定向测试、`fvm flutter analyze` 与全量 `fvm flutter test` 已通过。
- **Story 7-6 已完成**: 推送通知与设备注册。Flutter: `features/notifications/` 新增 `PushNotificationPayload`(Freezed, fromFcmData camelCase)、`DeviceApi`(register/unregister)、`NotificationService`(firebase_messaging 初始化/权限/token 生命周期/前台 flutter_local_notifications 显示/后台+终止态通知点击 StreamController + `getNotificationAppLaunchDetails()` 本地通知冷启动恢复)、`PushNotificationNotifier`(AsyncNotifier, initializeAfterAuth/cleanupOnLogout/token 刷新去重)。`main.dart` 添加 `Firebase.initializeApp()` + `onBackgroundMessage` 顶级函数。推送初始化由 `app.dart` 中 `ref.listen(authProvider, ...)` 监听认证状态边沿统一触发，避免登录双重初始化；`AuthNotifier` 仅在 logout/forceLogout 时调用 `cleanupOnLogout()`。`_AgentLoomAppState.initState()` 继续订阅 `onNotificationTap` 流实现深链 `GoRouter.go('/executions/$executionId')`。Android 配置: google-services 插件 + POST_NOTIFICATIONS 权限 + notification channel。iOS: FirebaseCore/FirebaseMessaging import + registerForRemoteNotifications。依赖: firebase_core ^3.13.0, firebase_messaging ^15.2.5, flutter_local_notifications ^19.2.1。新增测试覆盖 payload/api/service/provider/navigation/auth hooks，全量 416 passed，0 analyze issues。
