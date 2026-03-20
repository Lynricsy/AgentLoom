# 移动端概述

AgentLoom Mobile 是基于 Flutter 的移动端伴侣应用，让你随时随地监控和管理 AI 工作流的执行状态。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Flutter | 3.41.2 (FVM) | 跨平台 UI 框架 |
| Riverpod | 3.x | 状态管理（手写 Provider，无代码生成） |
| GoRouter | 17.x | 声明式路由 + 认证守卫 |
| Dio | 5.x | HTTP 客户端 + AuthInterceptor |
| Freezed | 3.x | 不可变模型 + JSON 序列化 |
| Socket.IO Client | 3.x | 实时执行状态推送 |
| FCM | firebase_messaging 15.x | 推送通知 |
| flutter_secure_storage | 9.x | Token 安全存储 |
| flutter_dotenv | 5.x | 环境变量管理 |
| mocktail | 1.x | 测试 Mock 框架 |

## 核心能力

### 🔐 认证与会话管理

完整的认证链路：LoginScreen → AuthApi → AuthNotifier → TokenStorage。支持 JWT token 自动刷新、401 智能处理（四种类型分类应对）、路由守卫自动跳转。

### 📊 Dashboard

快速访问常用工作流 + 最近执行记录聚合视图，点击即可跳转到执行监控页。

### 🔄 工作流管理

列表搜索与状态筛选、下拉刷新、无限滚动分页。详情页展示元数据卡片和执行历史，FAB 按钮一键启动。

### 📝 参数化启动

动态参数表单（text / number / single_select / multi_select），支持条件可见性、空参数确认、conversation 模式 Web 端引导。

### ⚡ 实时执行监控

Socket.IO `/execution` 命名空间实时推送 + REST 5 秒轮询降级。状态头、告警横幅、步骤时间线一目了然。

### 🔔 推送通知

FCM token 生命周期管理、前台本地通知转发、后台/终止态深链导航直达执行详情页。Firebase 配置文件缺失时优雅降级，推送功能自动跳过。

## 功能模块

应用包含 6 个 feature 模块：

| 模块 | 路径 | 职责 |
|------|------|------|
| `auth` | `features/auth/` | 登录/登出/Token 刷新/强制登出 |
| `dashboard` | `features/dashboard/` | 快速访问 + 最近执行聚合 |
| `workflows` | `features/workflows/` | 列表搜索/详情/参数化启动 |
| `execution` | `features/execution/` | Socket.IO 实时监控 + REST 轮询降级 |
| `notifications` | `features/notifications/` | FCM 推送 + 本地通知 + 深链跳转 |
| `settings` | `features/settings/` | 设置页（占位） |

## 导航结构

应用采用 `StatefulShellRoute.indexedStack` 三标签导航：

| 标签 | 路由 | 页面 |
|------|------|------|
| Dashboard | `/dashboard` | 快速访问 + 最近执行 |
| Workflows | `/workflows` | 工作流列表 |
| Settings | `/settings` | 设置 |

此外，执行监控页 `/executions/:executionId` 位于 Shell 外部，支持深链直达。

## 环境配置

通过 `flutter_dotenv` 加载三套环境文件，运行时通过 `--dart-define=ENV=<env>` 切换：

| 环境 | 文件 | 用途 |
|------|------|------|
| dev | `.env.dev` | 开发环境 |
| staging | `.env.staging` | 预发布环境 |
| prod | `.env.prod` | 生产环境 |

环境文件已声明为 Flutter assets，包含 `API_BASE_URL` 和 `APP_NAME` 等配置项。未传 `ENV` 参数时默认回退到 `dev`。

## 测试

当前共 **429 个测试**，覆盖模型、API、Provider、Widget、Screen、路由、认证、执行监控、Dashboard、工作流启动和推送通知等模块。

- 使用 `mocktail` 做 Mock
- 测试工厂函数集中在 `test/helpers/test_helpers.dart`
- Provider 错误测试使用 `container.listen()` + `Completer<void>` 模式
- Widget/Screen 测试使用 `UncontrolledProviderScope` 配合 `ProviderContainer`

## 与服务端的通信

移动端与 `agentloom-server` 共用同一套 REST API（`/api/v1`）和 Socket.IO 命名空间，和 Studio Web 端访问相同的后端服务。

```
agentloom_mobile ──HTTP REST──→ server (/api/v1)
                 ──Socket.IO──→ server (/execution namespace, JWT auth)
                 ←──FCM Push── server (notification module)
```

::: tip 下一步
- [架构详解](./architecture) — 深入了解各模块内部结构和关键设计模式
- [开发指南](./getting-started) — 环境搭建、运行、测试的完整步骤
:::
