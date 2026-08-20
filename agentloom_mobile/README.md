# agentloom_mobile

AgentLoom Flutter 客户端，面向移动设备并兼容桌面与 Web。应用提供认证与 MFA、工作流启动、执行实时监控、Agent 对话、通知以及 Workspaces、Sandboxes、Knowledge Bases、MCP Servers、LLM Models 等资源管理。

## 技术栈

- Flutter 3.41.2 / Dart
- Riverpod 3、GoRouter
- Dio、Socket.IO
- Freezed、json_serializable
- flutter_secure_storage、Firebase Messaging

## 数据契约

- REST JSON 统一由 `lib/shared/utils/json_key_normalizer.dart` 递归转换为 camelCase；同层双键以 camelCase 为准。
- REST 分页 query key 使用 `pageSize`。
- Socket 事件按 server 的 camelCase wire 解析。
- 资源 DTO 位于 `lib/features/resources/models/`，按 workspace、sandbox、knowledge base、MCP、LLM 拆分。
- 资源 provider 位于 `lib/features/resources/providers/`，只持有查询状态（列表与详情的 `AsyncNotifier`）；create/update/delete 由屏幕直接调用 `ResourcesApi`，成功后 invalidate 对应 family key。
- `ResourcesApi` 严格解包响应；契约错误抛出 `ApiContractException`。
- 追加分页失败通过 `loadMoreError` 呈现并保留已加载条目。
- `memoryAuditProvider(instanceId)` 直接使用 family 参数。
- `ExecutionSocketService.parseFailureCount` 与 `lastParseFailure` 提供 Socket 契约漂移诊断。

## 开发

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
```

生成应用图标：

```bash
dart run flutter_launcher_icons
```

环境通过 `--dart-define=ENV=<dev|staging|prod>` 选择，对应 `.env.dev`、`.env.staging`、`.env.prod`。未指定时使用 dev。

## 目录

```text
lib/
├── app/                 # 应用壳与响应式导航
├── config/              # 环境、主题、常量
├── features/            # auth、execution、agents、resources 等业务域
├── routes/              # GoRouter 与认证 guard
└── shared/              # Dio、interceptors、models、providers、utils、widgets
```

完整架构和 wire 约定见 `AGENTS.md`。
