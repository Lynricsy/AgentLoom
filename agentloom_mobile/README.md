# agentloom_mobile

AgentLoom Flutter 移动端应用，当前已覆盖 Story 7.3 / 7.3a / 7.4 / 7.4a 的核心能力：认证与会话管理、工作流列表/详情、Dashboard 最近执行聚合，以及基于 Socket.IO 的实时执行监控。

## 已实现能力

- Riverpod + GoRouter + Dio 的移动端基础架构
- 登录、token 存储、401 自动刷新与路由守卫
- 工作流列表、筛选、详情、执行历史
- Dashboard 快速访问工作流 + 最近执行聚合视图
- 执行监控页：
  - Socket.IO `/execution` 实时状态推送
  - REST execution detail 首次加载 + 5 秒 polling 降级
  - failed/cancelled 语义化横幅
  - 步骤时间线、节点名称/类型展示
  - `/executions/:executionId` 深链接 / Shell 外路由
- WorkflowDetail FAB 触发 `runWorkflow()` 后自动跳转执行监控页

## 开发命令

执行 Flutter 命令前请先注入 SDK 路径：

```bash
export PATH="/root/fvm/default/bin:$PATH"
```

常用命令：

```bash
fvm flutter pub get
fvm flutter analyze
fvm dart run build_runner build --delete-conflicting-outputs
fvm flutter test
fvm flutter test --coverage
```

## 目录概览

```text
lib/
├── app/                 # AgentLoomApp / ShellScaffold
├── config/              # 环境、主题、常量
├── features/
│   ├── auth/            # 登录、token 存储、AuthNotifier、AuthInterceptor
│   ├── dashboard/       # Quick Access + recentWorkflows/recentExecutions
│   ├── execution/       # Socket.IO 执行监控、timeline、banner、provider
│   ├── settings/        # 占位设置页
│   └── workflows/       # 工作流列表、详情、runWorkflow、execution models
├── routes/              # GoRouter、route names、auth redirect
└── shared/              # api client、paginated models、provider、共享组件
```

## 测试与验证

- `fvm flutter analyze`：静态检查
- `fvm flutter test`：当前全量 **307 passed**
- `fvm dart run build_runner build --delete-conflicting-outputs`：Freezed/JSON 生成物更新

## 环境文件

- `.env.dev`
- `.env.staging`
- `.env.prod`

默认通过 `--dart-define=ENV=<dev|staging|prod>` 选择环境，未传时回退到 `dev`。
