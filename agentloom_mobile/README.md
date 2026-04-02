# agentloom_mobile

AgentLoom Flutter 客户端，当前定位为移动优先、全端兼容的使用端应用。它已经覆盖认证与安全、工作流启动与执行监控、Agent 对话、通知，以及资源域的完整入口，并支持在运行时切换 Studio 地址。

## 已实现能力

- Riverpod + GoRouter + Dio 的应用基础架构
- `studioBaseUrl` 运行时配置：
  - 登录页与设置页都可进入 `ServerConfigScreen`
  - 由 Studio 地址自动派生 `apiBaseUrl`
- 认证与安全：
  - 邮箱密码登录
  - Google / GitHub OAuth
  - MFA TOTP 注册与验证
  - 密码修改、会话管理
- Dashboard：
  - 最近工作流
  - 最近执行聚合
- Workflows：
  - 列表、筛选、详情、执行历史
  - 参数输入页 `/workflows/:workflowId/launch`
  - 动态表单字段（text / number / single_select / multi_select）
  - `collectionMode != 'form'` 时的 Web-first fallback
- Execution Monitor：
  - Socket.IO `/execution` 实时状态推送
  - REST detail 首次加载 + polling 降级
  - 状态头、告警横幅、步骤时间线
  - Shell 外深链接 `/executions/:executionId`
- Agents：
  - Agent 列表、详情、会话入口
  - 对话页支持实时消息流、thinking 段、工具调用 / 工具结果瀑布流
  - 权限审批、终端输出、文件变更、工作区上下文面板
- Resources：
  - ResourcesHub 以无分类统一列表呈现资源入口
  - Memory
  - Skills
  - Workspaces
  - Sandboxes
  - Knowledge Bases
  - MCP Servers
  - LLM Models
- MCP Servers：
  - 配置列表与详情
  - 连接测试
  - 工具发现 / 导入 / 重导入
  - 配置编辑、删除
  - 已导入工具停用
- LLM Models：
  - 模型配置列表与详情
  - 创建 / 编辑 / 删除
  - Chat / Embedding 类型
  - API Key 选择
  - Private Cloud 连接测试与远端模型探测
- Notifications：
  - FCM token 生命周期管理
  - 前台本地通知
  - 后台 / 冷启动深链到执行详情

## 导航结构

- 总览
- 工作流
- Agent
- 资源
- 设置

`ShellScaffold` 会根据宽度自动在 `NavigationBar` 与 `NavigationRail` 间切换。

## 开发命令

项目固定 Flutter 3.41.2。若本地使用 FVM，可为下列命令加上 `fvm` 前缀：

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
flutter test --coverage
```

## 目录概览

```text
lib/
├── app/                 # AgentLoomApp / ShellScaffold
├── config/              # 环境、主题、常量
├── features/
│   ├── auth/            # 登录、OAuth、TokenStorage、MFA
│   ├── dashboard/       # Quick Access + recentWorkflows/recentExecutions
│   ├── execution/       # Socket.IO 执行监控、timeline、banner、provider
│   ├── notifications/   # FCM payload、设备注册 API、通知服务、push provider
│   ├── agents/          # Agent 列表/详情/对话、消息段与工具瀑布流
│   ├── memory/          # Memory 列表/详情/连接/配置/图谱
│   ├── resources/       # ResourcesHub + Workspaces/Sandboxes/Knowledge/MCP/LLM
│   ├── settings/        # ServerConfig、密码修改、MFA、会话管理
│   ├── skills/          # Skill 列表/详情/轻编辑
│   └── workflows/       # 工作流列表、详情、参数输入、启动
├── routes/              # GoRouter、route names、auth redirect
└── shared/              # api client、paginated models、provider、共享组件
```

## 测试与验证

- `flutter analyze`：静态检查通过
- `flutter test`：当前全量测试为 `650/650` 通过
- `dart run build_runner build --delete-conflicting-outputs`：更新 Freezed / JSON 生成物

## 环境文件

- `.env.dev`
- `.env.staging`
- `.env.prod`

默认通过 `--dart-define=ENV=<dev|staging|prod>` 选择环境，未传时回退到 `dev`。
