# agentloom_mobile 知识库

## 概览

AgentLoom Flutter 移动端应用：

- Riverpod ProviderScope 启动入口
- GoRouter + `StatefulShellRoute.indexedStack` 五标签导航（Dashboard / Workflows / Agents / Resources / Settings）
- `ShellScaffold` 根据宽度在 `NavigationBar` 与 `NavigationRail` 间切换，移动端优先但兼容大屏
- Dio API Client Provider（含 AuthInterceptor 自动附加 Bearer + 401 刷新重试）
- 运行时服务器地址配置：`EnvConfig` 以 `studioBaseUrl` 为真源，登录页与设置页都可进入 `ServerConfigScreen`，再派生 `apiBaseUrl`
- 完整认证链路：`LoginScreen` / `RegisterScreen` → `AuthApi` → `AuthNotifier` → `TokenStorage` (`flutter_secure_storage`)；邮箱密码注册成功后移动端不直接持久化首登 session，而是通过 Web-first fallback 引导到 Web Studio `/login?returnUrl=/onboarding` 完成首次组织初始化
- OAuth 登录：Google / GitHub 按钮通过 `url_launcher` 打开浏览器认证，服务端 `?platform=mobile` 参数触发 `agentloom://auth/callback?access_token=...` 重定向，`AuthCallbackScreen` 接收 deep link 并完成 token 存储
- MFA 支持：原生 TOTP 注册（`MfaEnrollScreen`）与验证（`MfaVerifyScreen`），通过 REST API 与服务端交互（非 Supabase 直连）
- GoRouter redirect guard：未认证 → `/login`，允许公开访问 `/register`，已认证访问 `/login` 或 `/register` → `/dashboard`
- Dashboard：快速访问工作流 + 最近执行聚合，点击最近执行跳转执行监控
- 工作流：列表、筛选、详情、执行历史、参数输入启动链路
- 执行监控：Socket.IO `/execution` 实时状态 + REST detail 轮询降级，状态头、告警横幅、步骤时间线、断连语义纠正
- Agent 管理：列表 / 详情 / 对话三屏；详情页会解析 `agent-main` 节点并展示 `nativeToolPolicy` / `selfEvolutionPolicy` 能力摘要
- Agent 对话：`AgentConversationScreen` 为 Shell 外全屏路由，Socket.IO `/agent-conversation` 实时消息推送，按 `message_chunk / thinking / tool_call / tool_result / done / terminal_output / file_change / status.changed` 分段渲染，包含权限审批、终端输出、文件变更、工作区上下文面板，以及自进化升级后的“重启到新版本”提示卡片；页面会根据 Agent `runtimeMode` 显示 `有沙箱 / 无沙箱` 状态，`no_sandbox` 会话不展示工作区/终端上下文面板，只保留消息流中的 Skill/Knowledge/Memory/MCP/自进化能力
- Agent 对话工作区预览优先级：standalone sandbox Agent 对话启动时，如果 Agent detail 同时存在顶层 `workspaceSnapshotId` 与 `sandboxConfig.restoreWorkspaceId`，Flutter 必须优先预载 `restoreWorkspaceId` 对应的目录树，以保证预览与 live sandbox 实际 restore 的工作区一致；没有 `restoreWorkspaceId` 时才回退到 `workspaceSnapshotId`
- 资源域：`ResourcesHubScreen` 以无分类统一资源列表挂载 `Memory / Skills / Workspaces / Sandboxes / Knowledge Bases / MCP Servers / LLM Models`
- 资源管理：
  - `Workspaces / Sandboxes / Knowledge Bases` 已接入真实 CRUD / 详情
  - `WorkspacesScreen` 默认隐藏 execution auto-archive 快照，通过 `include_auto_archived` 开关切换；DTO 会解析 `sourceKind/isAutoArchived` 并展示中文来源标签
  - `SandboxesScreen` 默认只看 `bindingType=resource` 的可复用沙箱，可切换到全部/对话/执行视图；DTO 会解析 `bindingType` 与 `timeoutSeconds`，timeout 文案按 `秒优先、否则小时` 展示
  - `Workflows / Agents / Knowledge Bases / Memory / MCP Servers / Skills` 列表均支持 `全部 / 自己创建 / 分享导入` 来源筛选；分享导入项展示统一来源标签，并可调用 `resource-sources/:type/:id/convert-to-manual` 转为自己创建
  - `MCP Servers` 支持发现、导入、重导入、测试、编辑、删除与工具停用
  - `LLM Models` 支持 Provider / Model 二级管理、列表、详情、创建、编辑、删除、缓存读/写与 token 阶梯定价展示、私有云测试与远端模型探测；Provider 新建/编辑 sheet 直接输入明文 API Key，由服务端加密托管，不再依赖先创建独立 key 资源；`LlmProviderIcon` 会将 managed Lobe icon URL 归一到 `@lobehub/icons-static-png` 的 theme-aware PNG 资源，并对 `anthropic -> claude-color`、`google -> gemini-color`、`siliconflow -> siliconcloud-color` 等 slug 做产品级彩色资产映射
- `PreferencesScreen` 使用按 Provider 分组的标题生成模型选择器，分组头展示 Provider 图标，仅显示启用中的 chat 模型，并在已选摘要中展示 Provider 名称
- Skill 管理：列表 / 详情 / 编辑，仅支持 `name/description` 编辑（`SKILL.md` 正文仍以 Studio Web 为主）
- Memory 管理：列表 / 详情 / 连接 / 配置 / 图谱五屏
- 推送通知：FCM token 生命周期管理、前台本地通知、后台/终止态深链到执行详情
- `collectionMode != 'form'` 时统一走 `ConversationModePrompt` Web-first fallback（对话式参数收集仍引导到 Web 端）

## 目录约定

```text
lib/
├── app/                 # AgentLoomApp / ShellScaffold
├── config/              # 环境、主题、常量
├── features/
│   ├── auth/            # 登录 / 注册、OAuth、TokenStorage、AuthNotifier、MFA
│   ├── dashboard/       # Quick Access + recentWorkflows/recentExecutions
│   ├── execution/       # Socket.IO 执行监控、timeline、banner、provider
│   ├── notifications/   # FCM payload、设备注册 API、通知服务、push provider
│   ├── agents/          # Agent 列表/详情/对话、消息段与工具瀑布流
│   ├── memory/          # Memory 列表/详情/连接/配置/图谱
│   ├── resources/       # 资源域 Hub + Workspaces/Sandboxes/Knowledge/MCP/LLM
│   ├── settings/        # ServerConfig、密码修改、MFA 管理、会话管理
│   ├── skills/          # Skill 列表/详情/轻编辑
│   └── workflows/       # 工作流列表、详情、参数输入、启动
├── routes/              # GoRouter、route names、auth redirect
└── shared/
    ├── interceptors/    # AuthInterceptor (QueuedInterceptorsWrapper, 401 刷新 + 重试)
    ├── models/          # PaginatedResponse<T> + PaginationMeta
    ├── providers/       # apiClientProvider、envProvider、secureStorageProvider
    └── widgets/         # 共享组件
```

## 命令

项目固定 Flutter 3.41.2。若本地通过 FVM 管理，可为下列命令加上 `fvm` 前缀：

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
flutter test --coverage
```

## 数据层模式

- **Freezed 3.x**：认证、工作流、执行、通知、部分 Agent / Skill / Memory 模型使用 `@freezed` + `.freezed.dart/.g.dart`
- **plain Dart DTO**：资源域 `features/resources/models/resource_entities.dart` 使用手写 DTO，方便同时适配 Workspaces / Sandboxes / Knowledge / MCP / LLM / API Keys
- **PaginatedResponse<T>**：泛型分页封装，`@JsonSerializable(genericArgumentFactories: true)`
- **Riverpod 3.x**：手写 Provider（无 `riverpod_generator`），`AsyncNotifier/FutureProvider` 用于认证、工作流、执行、Memory 等状态管理
- **FutureBuilder + StatefulWidget**：资源页以屏幕内局部 state 为主，依赖 `ResourcesApi` 直接驱动列表、详情与表单
- **`ref.mounted` 守卫**：所有 async 路径在 `await` 后检查 `ref.mounted`，避免 dispose 后写入
- **WorkflowApi**：`runWorkflow()` 发送 canonical camelCase `inputParams / launchSource`，`getInputSchema()` 对 `collectionMode / visibility / collectionHint` 做兼容归一化
- **WorkflowInputSchema**：含可选 `conversationPlan { systemPrompt, maxTurns }`，非表单采集统一走 `ConversationModePrompt`
- **Execution monitor**：REST detail 建立初始 snapshot；WS ACK / plain snapshot 通过 metadata merge 保留 `nodeName/nodeType/startedAt/completedAt`；断连后 5 秒 polling fallback
- **AgentConversationNotifier**：维护对话消息流、Socket 连接、权限审批、终端输出、文件树与历史回拉；权限审批支持 `rememberScope=conversation_category`，并能消费服务端下发的升级重启建议

## 测试模式

- 自动化测试覆盖 models / api / providers / widgets / screens / routes / auth / execution / dashboard / workflows / notifications / resources
- Provider 错误测试使用 `container.listen()` + `Completer<void>` 模式避免 Riverpod 3.x dispose `StateError`
- Widget / Screen 测试使用 `UncontrolledProviderScope` 配合 `ProviderContainer`
- Mock 使用 `mocktail`，测试工厂函数集中在 `test/helpers/test_helpers.dart`

## 当前注意事项

- `envProvider` 在 `main.dart` 中通过 `ProviderScope.overrides` 注入真实环境
- `secureStorageProvider` 在 `main.dart` 中通过 `ProviderScope.overrides` 注入 `FlutterSecureStorage()` 实例
- `url_launcher` 用于 OAuth 浏览器认证跳转，也用于需要跳 Web Studio 的场景
- AuthApi 使用独立 `authDioProvider`（无 AuthInterceptor）避免循环依赖
- `AuthNotifier.register()` 调用后端 `POST /api/v1/auth/register`，成功后保持 `unauthenticated` 状态，由注册页继续引导用户去 Web Studio 完成首次组织初始化，避免保留 `tenant_id=null` 的半初始化移动端会话
- AuthInterceptor 处理 4 种 401 type：`token-expired`（刷新重试），`token-revoked` / `token-invalid` / `token-missing`（强制登出）
- AuthInterceptor 继承 `QueuedInterceptorsWrapper`，序列化并发 401 请求，避免多个请求同时触发 refresh；含 stale-token 优化
- GoRouter redirect guard 通过 `AuthRouteNotifier`（ChangeNotifier）桥接 Riverpod authProvider，并统一等待 `authProvider.future` 完成后再判断首屏路由
- `TokenStorage.hasTokens()` 与 `readTokens()` 一致，要求 `access/refresh/expires_in` 三项完整
- `.env.dev` / `.env.staging` / `.env.prod` 已提交到 git，并在 `pubspec.yaml` 声明为 Flutter assets
- `ResourcesApi` 同时封装 `Workspaces / Sandboxes / Knowledge Bases / MCP / LLM / API Keys` 的 REST 读写；资源页错误文案统一走 `describeResourceError()`
- WorkflowDetailScreen 在 `.when()` 前检查 `hasError && !hasValue` 以兼容 Riverpod 3.x 的 `AsyncLoading(error: ...)` 中间状态
- `WorkflowLaunchNotifier.submit()` 在异步成功 / 失败路径均使用 `ref.mounted` 守卫，防止 dispose 后写入状态

## 平台配置

- **Deep Link**：`agentloom://` URL scheme 已配置。Android `AndroidManifest.xml` 使用 `intent-filter` 声明 `agentloom` scheme；iOS `Info.plist` 使用 `CFBundleURLTypes` 注册 `agentloom` scheme
- **iOS**：`AppDelegate` 实现 `FlutterImplicitEngineDelegate` + `FlutterAppDelegate`，支持 Firebase Messaging
- **Android**：`AndroidManifest.xml` 声明 `POST_NOTIFICATIONS` 权限；`main.dart` 中后台消息 handler 使用 `@pragma('vm:entry-point')`
- **Firebase 优雅降级**：应用在无 `google-services.json` / `GoogleService-Info.plist` 时仍可正常运行，推送功能自动跳过

## 推送通知细节

- `PushNotificationNotifier._initCompleter` 提供幂等锁，多次调用 `initializeAfterAuth()` 只执行一次初始化
- FCM token 缓存 + dedup，避免重复注册
- 前台消息转 JSON local notification payload（通过 `flutter_local_notifications` 展示）
