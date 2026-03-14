# agentloom_mobile

AgentLoom Flutter 移动端应用，当前已覆盖 Story 7.3 / 7.3a / 7.4 / 7.4a / 7.5 / 7.6 的核心能力：认证与会话管理、工作流列表/详情、参数输入启动链路、Dashboard 最近执行聚合、基于 Socket.IO 的实时执行监控，以及基于 FCM 的移动端推送通知与设备注册。

## 已实现能力

- Riverpod + GoRouter + Dio 的移动端基础架构
- 登录、token 存储、401 自动刷新与路由守卫
- 工作流列表、筛选、详情、执行历史
- 工作流启动参数输入：
  - `/workflows/:workflowId/launch` 参数页路由
  - 动态表单字段（text / number / single_select / multi_select）
  - required / min / max / minLength / maxLength 客户端校验
  - 空参数确认页与 `collectionMode='conversation'` Web 端引导
- Dashboard 快速访问工作流 + 最近执行聚合视图
- 执行监控页：
  - Socket.IO `/execution` 实时状态推送
  - REST execution detail 首次加载 + 5 秒 polling 降级
  - failed/cancelled 语义化横幅
  - 步骤时间线、节点名称/类型展示
  - `/executions/:executionId` 深链接 / Shell 外路由
- 移动端推送通知：
  - `features/notifications/` 中的 FCM payload 模型、设备注册 API、通知服务与 Riverpod notifier
  - 认证状态从未认证 → 已认证时统一初始化推送权限与 token 注册，登出/强制登出时清理注册与本地 token
  - 前台消息转本地通知，点击系统推送、本地通知，以及本地通知冷启动恢复时都能跳转 `/executions/:executionId`
  - Android/iOS 已补齐 Firebase messaging 所需基础平台配置（不含 `google-services.json` / `GoogleService-Info.plist`）
- WorkflowDetail FAB 先进入参数页，再由参数提交成功后跳转执行监控页

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
│   ├── notifications/   # FCM payload、设备注册 API、通知服务、push provider
│   ├── settings/        # 占位设置页
│   └── workflows/       # 工作流列表、详情、parameter launch、runWorkflow、execution/input-schema models
├── routes/              # GoRouter、route names、auth redirect
└── shared/              # api client、paginated models、provider、共享组件
```

## 测试与验证

- `fvm flutter analyze`：静态检查
- `fvm flutter test`：当前全量测试应保持绿色（最新基线为 416/416）
- `fvm dart run build_runner build --delete-conflicting-outputs`：Freezed/JSON 生成物更新

## 环境文件

- `.env.dev`
- `.env.staging`
- `.env.prod`

默认通过 `--dart-define=ENV=<dev|staging|prod>` 选择环境，未传时回退到 `dev`。
