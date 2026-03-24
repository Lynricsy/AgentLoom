# agentloom_mobile 知识库

## 概览

AgentLoom Flutter 移动端应用：

- Riverpod ProviderScope 启动入口
- GoRouter + `StatefulShellRoute.indexedStack` 五标签导航 (Dashboard / Workflows / Agents / Skills / Settings)
- Dio API Client Provider（含 AuthInterceptor 自动附加 Bearer + 401 刷新重试）
- dotenv 环境切换（dev / staging / prod）
- 完整认证链路：LoginScreen → AuthApi → AuthNotifier → TokenStorage (flutter_secure_storage)
- OAuth 登录：Google / GitHub OAuth 按钮通过 `url_launcher` 打开浏览器认证，服务端 `?platform=mobile` 参数触发 `agentloom://auth/callback?access_token=...` 重定向，`AuthCallbackScreen` 接收 deep link 并完成 token 存储
- MFA 支持：原生 TOTP 注册（`MfaEnrollScreen`，展示 QR 码 + 验证码确认）与验证（`MfaVerifyScreen`，6 位验证码输入），通过 REST API 与服务端交互（非 Supabase 直连）
- GoRouter redirect guard：未认证 → /login，已认证 + /login → /dashboard
- 工作流列表页（搜索、状态筛选、下拉刷新、无限滚动）
- 工作流详情页（元数据卡片、执行历史、FAB 运行按钮）→ 点击执行记录跳转执行监控
- 工作流启动页（`ParameterInputScreen`）：动态参数表单、空参数确认、conversation 模式 Web 引导
- Dashboard 页（快速访问工作流 + recentExecutions 聚合）→ 点击最近执行跳转执行监控
- 执行监控：Socket.IO 实时状态 + REST execution detail 5s 轮询降级，状态头 + 告警横幅 + 步骤时间线 + disconnected 语义纠正
- 推送通知：FCM token 生命周期管理、前台本地通知、后台/终止态深链导航到执行详情
- 工作流启动链路：`WorkflowDetailScreen` FAB → `/workflows/:workflowId/launch` → 参数提交 → `/executions/:executionId`
- Agent 管理：Agent 列表/详情/对话三屏，4th shell branch (Agents tab)
- Agent 对话：`AgentConversationScreen` 全屏路由（非 shell 内），Socket.IO `/agent-conversation` 实时消息推送
- Skill 管理：Skill 列表/详情/编辑三屏，仅支持 name/description 编辑（SKILL.md 内容编辑仅在 Studio Web 端）
- Memory 管理：Memory 列表/详情/连接/配置/图谱五屏，19 个文件，位于 `features/memory/`
- `collectionMode != 'form'` 时统一走 `ConversationModePrompt` Web-first fallback（对话收集需使用 Web 端）

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
│   │   ├── screens/     # LoginScreen (email/password + 验证 + 错误/MFA/加载态), AuthCallbackScreen (OAuth deep link 回调处理), MfaEnrollScreen (原生 TOTP QR 码注册 + 验证), MfaVerifyScreen (原生 TOTP 验证码输入)
│   │   └── widgets/     # AuthTextField (可复用, 密码可见性切换), OAuthButton (Google/GitHub OAuth via url_launcher)
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
│   │   ├── api/         # SettingsApi (密码修改/MFA 管理/会话列表/会话撤销)
│   │   ├── providers/   # SettingsProvider (settings 状态管理)
│   │   ├── screens/     # SettingsScreen (主设置页), ChangePasswordScreen (密码修改), MfaManageScreen (MFA TOTP 管理), SessionListScreen (活跃会话列表与撤销)
│   │   └── widgets/     # AccountSection (个人资料 + 退出登录)
│   └── workflows/
│       ├── api/         # WorkflowApi (list/get/executions/run/getExecution/getInputSchema) + workflowApiProvider
│       ├── models/      # Freezed: WorkflowDefinitionDto, ExecutionSummaryDto, ExecutionStepDto, WorkflowInputSchema, InputFieldDefinition
│       ├── providers/   # WorkflowListNotifier, workflowDetailProvider, workflowExecutionsProvider, WorkflowLaunchNotifier
│       ├── screens/     # WorkflowsScreen, WorkflowDetailScreen, ParameterInputScreen
│       └── widgets/     # WorkflowCard, WorkflowStatusChip, ExecutionSummaryTile, input-field widgets, no-params/conversation prompts
│   └── agents/
│       ├── api/         # AgentApi (list/get/conversations/messages/send) + agentApiProvider
│       ├── models/      # Freezed: AgentDefinitionDto, AgentConversationDto, AgentMessageDto
│       ├── providers/   # AgentListNotifier, agentDetailProvider, AgentConversationNotifier
│       ├── screens/     # AgentListScreen, AgentDetailScreen, AgentConversationScreen (全屏对话)
│       └── widgets/     # AgentCard, AgentStatusChip, ConversationBubble, MessageInput
│   └── skills/
│       ├── api/         # SkillApi (list/get/update) + skillApiProvider
│       ├── models/      # Freezed: SkillDto (id/name/slug/description/status/isBuiltin)
│       ├── providers/   # SkillListNotifier, skillDetailProvider
│       └── screens/     # SkillListScreen, SkillDetailScreen, SkillEditScreen (仅 name/description，不含 SKILL.md 内容编辑)
│   └── memory/
│       ├── api/         # MemoryApi + memoryApiProvider
│       ├── models/      # Freezed: Memory DTOs
│       ├── providers/   # MemoryListNotifier, memoryDetailProvider
│       └── screens/     # MemoryListScreen, MemoryDetailScreen, MemoryConnectionScreen, MemoryConfigScreen, MemoryGraphScreen
├── routes/              # go_router 配置 (含 AuthRouteNotifier redirect guard, /executions/:executionId 与 /agents/:agentId/conversations/:conversationId 顶层路由) 与路由名
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

- **Freezed 3.x**: 模型使用 `abstract class` + `sealed class` + `@freezed` + `@JsonKey(name: 'snake_case')` 进行 JSON 序列化；生成的 `.freezed.dart` / `.g.dart` 已提交到 git
- **InputFieldDefinition**: 有意不使用 Freezed（含递归 `Object?` equality，Freezed deep equality 不适用）
- **PaginatedResponse<T>**: 泛型分页封装，`@JsonSerializable(genericArgumentFactories: true)`
- **WorkflowApi**: 封装 Dio 调用，方法签名与服务端 REST 端点一一对应；`getExecution()` 消费完整 execution detail `steps[]`，`getInputSchema()` 会对 `collectionMode`/`minLength`/`maxLength`/`visibility`/`collectionHint` 做 camelCase/snake_case 兼容归一化，`runWorkflow()` 发送 canonical camelCase `inputParams` / `launchSource`
- **InputFieldDefinition**: 含可选 `visibility: InputFieldVisibility { fieldId, equals }`（`fromJson()` 兼容 `fieldId/field_id`）与可选 `collectionHint`；`ParameterInputScreen` 基于 visibility 递归求值决定字段显示，提交时仅收集可见字段
- **WorkflowInputSchema**: 含可选 `conversationPlan: ConversationPlan { systemPrompt, maxTurns }`，`collectionMode != 'form'` 时统一走 `ConversationModePrompt` Web-first fallback
- **Riverpod 3.x**: 手写 Provider（无 riverpod_generator / @riverpod），AsyncNotifier/FutureProvider 用于状态管理；constructor-injection `family` 模式
- **Sealed class 状态**: `AuthState`（Freezed sealed）、`ExecutionMonitorState`、`WorkflowLaunchState`、`WorkflowListState` 均为 sealed class 状态机，非 plain AsyncValue
- **`ref.mounted` 守卫**: 所有 async 路径在 `await` 后均检查 `ref.mounted`，防止 dispose 后写入
- **execution monitor**: REST detail 建立初始 snapshot；WS ACK / plain snapshot 通过 metadata merge 保留 `nodeName/nodeType/startedAt/completedAt`；断连后 5 秒 polling fallback
- **Agent 数据层**: `AgentApi` 封装 Agent 定义列表/详情与对话生命周期 REST API，`AgentListNotifier` / `agentDetailProvider` 管理列表与详情状态，`AgentConversationNotifier` 管理对话消息流与 Socket.IO `/agent-conversation` 实时连接。`AgentConversationScreen` 为全屏路由（非 shell 标签内），支持多轮对话与 mid-stream message injection

## 测试模式

- **429 个测试** 覆盖 models/api/providers/widgets/screens/routes/auth/execution/dashboard/workflow-run/parameter-input/notifications
- Provider 错误测试使用 `container.listen()` + `Completer<void>` 模式避免 Riverpod 3.x dispose StateError
- Widget/Screen 测试使用 `UncontrolledProviderScope` 配合 `ProviderContainer`
- Mock: `mocktail` 库，测试工厂函数集中在 `test/helpers/test_helpers.dart`
- Dashboard recent executions 相关测试现在覆盖聚合、排序、区块渲染与 runWorkflow 导航

## 当前注意事项

- `envProvider` 在 `main.dart` 中通过 `ProviderScope.overrides` 注入真实环境
- `secureStorageProvider` 在 `main.dart` 中通过 `ProviderScope.overrides` 注入 `FlutterSecureStorage()` 实例
- `url_launcher` 用于 OAuth 浏览器认证跳转，依赖 `^6.3.1`
- AuthApi 使用独立 `authDioProvider` (无 AuthInterceptor) 避免循环依赖
- AuthInterceptor 处理 4 种 401 type: `token-expired` (刷新重试), `token-revoked`/`token-invalid`/`token-missing` (强制登出)
- AuthInterceptor 继承 `QueuedInterceptorsWrapper`，序列化并发 401 请求（避免多个请求同时触发 refresh）；含 stale-token 优化（比较当前 token 与失败 token，已刷新则直接重试不再 refresh）
- GoRouter redirect guard 通过 `AuthRouteNotifier` (ChangeNotifier) 桥接 Riverpod authProvider，并统一等待 `authProvider.future` 完成后再判断首屏路由
- `TokenStorage.hasTokens()` 与 `readTokens()` 一致，要求 access/refresh/expires_in 三项完整
- `.env.*` 已在 `pubspec.yaml` 声明为 Flutter assets，供 `flutter_dotenv` 加载
- `.env.dev` / `.env.staging` / `.env.prod` 已提交到 git，通过 `--dart-define=ENV=<dev|staging|prod>` 选择环境
- WorkflowDetailScreen 在 `.when()` 前检查 `hasError && !hasValue` 以兼容 Riverpod 3.x 的 `AsyncLoading(error: ...)` 中间状态
- `WorkflowLaunchNotifier.submit()` 在异步成功/失败路径均使用 `ref.mounted` 守卫，防止 dispose 后写入状态

## 平台配置

- **Deep Link**: `agentloom://` URL scheme 配置。Android `AndroidManifest.xml` 使用 `intent-filter` 声明 `agentloom` scheme 处理；iOS `Info.plist` 使用 `CFBundleURLTypes` 注册 `agentloom` scheme。OAuth 回调通过 `agentloom://auth/callback` 路由接收
- **iOS**: `AppDelegate` 实现 `FlutterImplicitEngineDelegate` + `FlutterAppDelegate`，支持 Firebase Messaging
- **Android**: `AndroidManifest.xml` 声明 `POST_NOTIFICATIONS` 权限；FCM channel ID 硬编码；`main.dart` 中后台消息 handler 使用 `@pragma('vm:entry-point')` 标注
- **Firebase 优雅降级**: 应用在无 Firebase 配置文件（`google-services.json` / `GoogleService-Info.plist`）时仍可正常运行，推送功能自动跳过

## 推送通知细节

- `PushNotificationNotifier._initCompleter` 提供幂等锁，多次调用 `initializeAfterAuth()` 只执行一次初始化
- FCM token 缓存 + dedup，避免重复注册
- 前台消息转 JSON local notification payload（通过 `flutter_local_notifications` 展示）
