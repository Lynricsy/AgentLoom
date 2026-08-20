# agentloom_mobile 知识库

Flutter 移动优先客户端，使用 Riverpod、GoRouter 与 Dio，覆盖认证、工作流启动、执行监控、Agent 对话、通知和资源管理。

## 目录

```text
lib/
├── app/                 # 应用壳与响应式导航
├── config/              # 环境、主题、常量
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── execution/
│   ├── notifications/
│   ├── agents/
│   ├── memory/
│   ├── resources/
│   ├── settings/
│   ├── skills/
│   └── workflows/
├── routes/              # GoRouter 与认证 redirect
└── shared/              # interceptors、models、providers、utils、widgets
```

Riverpod 3 使用手写 Provider/AsyncNotifier，不使用 generator。异步 notifier 在 `await` 后通过 `ref.mounted` 防止 dispose 后写入。

## REST wire 处理

- `lib/shared/utils/json_key_normalizer.dart` 是 REST JSON 的统一递归 snake_case → camelCase 入口。
- Map/List 递归归一；同一层同时出现 snake_case 与 camelCase 双键时，camelCase 值优先。
- DTO 的 `fromJson` 边界先归一，不在单个字段读取点继续增加 snake/camel 双 key 分支。
- 分页 query 参数统一使用 `page` 与 `pageSize`。
- 请求体和 query 参数遵循 server 的 camelCase DTO；Dio interceptor 负责认证而不改写 socket payload。

## Socket wire 处理

- `/execution` Socket 事件按 server wire 的 camelCase 解析，例如 `eventId`、`executionId`、`tenantId`。
- execution event 模型不使用 `FieldRename.snake`。
- `ExecutionSocketService` 暴露只读诊断字段 `parseFailureCount` 与 `lastParseFailure`。解析失败会累计计数、保存最近失败详情并输出结构化 debug 信息，不静默丢弃。
- Flutter 原生端使用 websocket transport；Flutter Web 使用 polling → websocket 升级链路。
- REST detail 建立执行初始 snapshot；Socket 事件推进实时状态；断连时使用 polling fallback。

## 资源域

`lib/features/resources/` 的职责分层：

```text
resources/
├── api/resources_api.dart
├── models/
│   ├── workspace_dto.dart
│   ├── sandbox_dto.dart
│   ├── knowledge_base_dto.dart
│   ├── mcp_dto.dart
│   ├── llm_dto.dart
│   ├── resource_dtos.dart
│   └── resource_envelope_decoder.dart
├── providers/
│   ├── workspace_provider.dart
│   ├── sandbox_provider.dart
│   ├── knowledge_base_provider.dart
│   ├── mcp_provider.dart
│   └── llm_provider.dart
└── screens/
```

- DTO 按资源类型拆分，使用 Freezed/json_serializable；`resource_dtos.dart` 是统一 barrel。
- 每类资源的 Riverpod provider 归属 `providers/`，屏幕通过 provider 读取、mutation 和 invalidate，不用 FutureBuilder 复制服务端实体缓存。
- `resource_envelope_decoder.dart` 定义 `ApiContractException`。`resources_api.dart` 严格解包 object/list/pagination envelope；缺少 `data`、元素不是对象、必需字段错误等契约问题抛异常，不返回空列表或空字符串伪造成功。
- MCP 凭据输入使用遮罩；Provider API key 由服务端加密托管。

## 分页状态

技能、工作流、Agent、Memory 列表及 Memory audit 的分页 state 使用：

- `items/entries`：已经加载的数据
- `isLoadingMore`：追加页进行中
- `loadMoreError`：追加页失败

load-more 失败必须保留已加载数据、清除 `isLoadingMore` 并设置 `loadMoreError`；重试或新一次加载前清除该字段。首屏失败仍使用 AsyncValue error。

`memoryAuditProvider` 是 `AsyncNotifierProvider.family<..., String>`，调用点直接传 `instanceId`；路由不通过 `ProviderScope` override 注入实例 ID。

## 认证与导航

- `EnvConfig.studioBaseUrl` 是服务器地址配置来源，`apiBaseUrl` 从中派生。
- `AuthInterceptor` 是 `QueuedInterceptorsWrapper`，附加 Bearer token，并串行处理并发 401 refresh。
- refresh 成功同时更新 `TokenStorage` 与 authProvider 内存态。
- GoRouter 使用 `StatefulShellRoute.indexedStack` 提供 Dashboard、Workflows、Agents、Resources、Settings 五标签导航。
- MFA 使用 server REST TOTP API。

## Agent 对话

- 新对话路由先进入草稿态，首条消息通过 start conversation API 创建会话。
- `/agent-conversation` Socket 负责实时消息、thinking、工具调用、权限审批、终端与文件变化。
- canonical 附件结构为 `metadata.attachments[]`，读取层兼容单附件 `metadata.attachment`。
- 单附件上限 1.5 MB，单消息附件总量 10 MB，文本内联上限 200 KB。
- sandbox 对话展示工作区/进程上下文；`no_sandbox` 不渲染该上下文面板。

## 命令与测试

项目固定 Flutter 3.41.2：

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
dart run flutter_launcher_icons
flutter analyze
flutter test
flutter test --coverage
```

测试使用 `ProviderContainer` / `UncontrolledProviderScope`、mocktail 和 `test/helpers/test_helpers.dart` 工厂。Provider 错误测试使用 `container.listen()` 保持 provider 生命周期。
