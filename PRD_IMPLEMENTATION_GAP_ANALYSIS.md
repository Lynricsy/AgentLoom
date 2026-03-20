# PRD Implementation Gap Analysis

## 审查结论

基于 `_bmad-output/planning-artifacts/prd.md` 的全部阶段要求（包含 MVP、V1.0、V1.5，按“1.5 阶段必须已完工”的口径审查），当前仓库仍存在 **4 个可以直接认定为未完整实现或 placeholder 化的真实缺口**。这些问题不是单纯的注释遗留，而是已经暴露到真实用户路径、服务端能力开关或前端交互路径上的未闭环实现。

本次审查同时区分了两类容易误报的项：

- **真实 PRD 缺口**：需求已承诺，但代码仍为占位、预览态或缺关键执行链。
- **代码层 placeholder 痕迹但暂不构成主缺口**：例如命名仍含 `placeholder`，但真实运行链路已经收口。

## 审查范围与方法

- PRD：`_bmad-output/planning-artifacts/prd.md`
- 辅助文档：`_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-06.md`
- 代码核查：`agentloom-studio/`、`agentloom-server/`、`agentloom_mobile/`
- 辅助上下文：Oracle 审查策略、两路 explore 结果、历史 Agent 日志

判定标准：

1. 不能只看“有页面/有接口/有类型”；必须检查是否存在真实可用的完整闭环。
2. 不能把 `preview-only`、`Coming Soon`、`TODO(...)` 当成已完成。
3. 由于当前要求是 **V1.5 也必须全部完工**，因此 PRD 中所有标为 `[V1.0]` / `[V1.5]` 的能力也必须视为当前应完成。

## Findings 概览

| 严重级别 | 缺口 | 对应 PRD | 当前状态 |
| --- | --- | --- | --- |
| High | Studio Web 认证/会话入口仍是 localStorage 手工 token 占位 | `FR54`, `NFR12` | 未完成 |
| High | API Event 触发器全链路仍是 preview-only / 空壳 | `FR37` | 未完成 |
| High | Mobile OAuth / MFA 登录闭环缺失 | `FR54`, `NFR12` | 未完成 |
| Medium | Mobile Settings 已接入路由，但页面仍是 Coming Soon stub | `FR54`（用户安全设置管理） | 未完成 |

## 1. Studio Web 认证/会话入口未完成

### 对应 PRD

- `FR54`：用户可以注册账户、登录和管理安全设置。
- `NFR12`：认证需支持 OAuth 2.0 / OIDC 与 MFA。

### 代码证据

1. `agentloom-studio/src/features/execution/hooks/useAuthToken.ts:1`
   - 文件头直接写明：`TODO(auth): 当认证系统实现后，替换为真正的 JWT 获取逻辑`。
2. `agentloom-studio/src/features/execution/hooks/useAuthToken.ts:18`
   - `getSnapshot()` 直接读取 `localStorage('auth_token')`。
3. `agentloom-studio/src/features/execution/hooks/useAuthToken.ts:26`
   - `getServerSnapshot()` 永远返回 `undefined`。
4. `agentloom-studio/src/features/execution/hooks/useAuthToken.ts:30`
   - 注释明确写：返回 `undefined` 时 socket 会被服务端 4001 拒绝。
5. `agentloom-studio/src/app/routes/__root.tsx:27`
   - 根布局直接依赖 `useAuthToken()` 给通知 socket 建链。
6. `agentloom-studio/src/app/routes/__root.tsx:85`
   - 路由树只有 workflows / executions / templates / marketplace / settings 等，没有 login route。
7. `agentloom-studio/src/features/auth/`
   - 仓库中不存在该目录，说明没有独立 Web auth feature。

### 为什么判定为未完成

这不是“登录页存在但 token provider 还有一点 technical debt”，而是 **Web Studio 整条认证入口本身缺失**，当前仅靠手工写入 localStorage token 维持受保护页面和 socket 连接。对于 `FR54` 和 `NFR12` 来说，这属于真实未闭环，而不是可接受的实现细节。

### 影响

- Web 端登录入口不存在。
- Web 端会话恢复、登出、安全设置管理无正式入口。
- Web 端 OAuth / MFA 体验无法从 Studio 前端完成闭环验证。

## 2. API Event 触发器仍是 preview-only / 空壳

### 对应 PRD

- `FR37`：事件驱动触发器应支持 cron、Webhook 和外部 API 事件。

### 代码证据

#### 服务端明确拒绝 `api_event`

1. `agentloom-server/src/modules/trigger/trigger.service.ts:334`
   - `buildCreateConfig()` 遇到 `api_event` 直接 `throw new TriggerTypePreviewOnlyException(type)`。
2. `agentloom-server/src/modules/trigger/trigger.service.ts:358`
   - `buildUpdatedConfig()` 遇到 `api_event` 同样直接抛 preview-only 异常。
3. `agentloom-server/src/modules/trigger/trigger.service.ts:363`
   - `assertMutableTriggerType()` 对 `api_event` 一律拒绝。

#### 事件适配器本身仍是空壳

4. `agentloom-server/src/modules/trigger/adapters/github-webhook.adapter.ts:10`
   - `validateEvent()` 恒 `return true`。
5. `agentloom-server/src/modules/trigger/adapters/github-webhook.adapter.ts:14`
   - `matchesTrigger()` 恒 `return false`。
6. `agentloom-server/src/modules/trigger/adapters/event-source.adapter.ts:1`
   - 只有接口定义，没有真正可用的通用事件源实现。

#### Studio UI 全面禁止使用 `api_event`

7. `agentloom-studio/src/features/trigger/components/TriggerCreateDialog.tsx:168`
   - 常量文案直接写：`API Event 当前仅支持预览，不支持创建、编辑或启用触发器。`
8. `agentloom-studio/src/features/trigger/components/TriggerCreateDialog.tsx:349`
   - 提交时若 `values.type === 'api_event'`，只弹 warning 后直接 return。
9. `agentloom-studio/src/features/trigger/components/TriggerCreateDialog.tsx:475`
   - `ApiEventConfigForm` 以 `disabled` 模式渲染。
10. `agentloom-studio/src/features/trigger/components/TriggerCreateDialog.tsx:495`
    - 提交按钮在 `isApiEventPreview` 时禁用并显示 `API Event 预览中`。
11. `agentloom-studio/src/features/trigger/components/TriggerCard.tsx:142`
    - 状态直接显示“预览中 / API Event 暂不可启用或停用”。
12. `agentloom-studio/src/features/trigger/components/TriggerCard.tsx:184`
    - 卡片正文写明“暂未自动消费外部事件”。
13. `agentloom-studio/src/features/trigger/components/ApiEventConfigForm.tsx:28`
    - 标记 `V1.0 Preview`，并明确写“自动消费能力仍在准备中”。

### 为什么判定为未完成

这已经不是“某个 UI 表单没有放开”的问题，而是 **后端创建/更新/启停全拒绝，适配器逻辑为空壳，前端也显式按预览态封口**。按当前“V1.5 应全部完工”的审查口径，`FR37` 属于明确未完成。

### 影响

- 用户无法创建、编辑、启用 API Event 触发器。
- 服务端没有真实可用的 API Event 事件匹配执行链。
- 该能力在产品表面存在，但本质仍是预配置壳。

## 3. Mobile OAuth / MFA 登录闭环未完成

### 对应 PRD

- `FR54`：用户可以登录并管理安全设置。
- `NFR12`：支持 OAuth 2.0 / OIDC 与 MFA。

### 代码证据

1. `agentloom_mobile/lib/features/auth/screens/login_screen.dart:75`
   - 当状态为 `AuthStateMfaRequired` 时，前端直接提示：`此账户需要多因素认证，请在 Web 端登录`。
2. `agentloom_mobile/lib/features/auth/screens/login_screen.dart:156`
   - 保留 `TODO(oauth): 后续 Story 添加 OAuth 按钮区域`。
3. 移动端代码中存在 `AuthStateMfaRequired` 状态模型和 provider 测试，但 UI 没有继续承接 MFA 流程，只是回退到 Web。

### 为什么判定为未完成

移动端并非完全没有认证基础：邮箱密码、refresh token、secure storage 链路已经实现。但在 PRD 要求的 **OAuth / OIDC / MFA** 维度上，移动端仍未闭环：

- 没有 OAuth 入口；
- 遇到 MFA 直接要求用户去 Web；
- 因此“支持 MFA/OAuth”只存在于后端或模型层，不存在于移动端真实用户流程里。

### 影响

- 支持 MFA 的账号无法在移动端完成登录闭环。
- 移动端不满足 `NFR12` 对 OAuth / MFA 的客户端能力承接要求。

## 4. Mobile Settings 已接入真实导航，但页面仍是 Coming Soon

### 对应 PRD

- `FR54`：用户可以管理安全设置（密码修改、MFA 启停、活跃会话管理）。

### 代码证据

1. `agentloom_mobile/lib/features/settings/screens/settings_screen.dart:3`
   - 文件注释直接写 `Settings 占位屏幕`。
2. `agentloom_mobile/lib/features/settings/screens/settings_screen.dart:5`
   - TODO 写明后续才替换为实际实现。
3. `agentloom_mobile/lib/features/settings/screens/settings_screen.dart:11`
   - 页面只有 `Text('Settings (Coming Soon)')`。
4. `agentloom_mobile/lib/routes/app_router.dart:117`
   - `/settings` 已真实接入三标签导航分支。

### 为什么判定为未完成

这个页面不是仓库里闲置的草稿，而是用户可直接点击到达的正式导航入口。既然 PRD 已要求用户管理安全设置，而移动端又已经显式暴露 Settings tab，那么当前实现显然仍是 stub。

### 影响

- 用户会进入一个已接线路由的空页面。
- 个人资料、通知偏好、环境切换、安全相关设置都无实际实现。

## 非主缺口但需记录的观察项

### A. `private_cloud` 代码中仍有 placeholder 命名，但运行链路已收口

- `agentloom-server/src/modules/llm/pi-ai-adapter.ts` 中存在 `PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER` 常量名。
- 但源码已通过自定义 `fetch` 在 `authMethod = 'none'` 时移除 `Authorization` 头，历史 story 记录也表明这条执行路径已经修复完成。

结论：**命名仍有误导性，但不应作为“功能未完成”上报。**

### B. 移动端 Dark Theme 仍有 `TODO(theme)`，但更像视觉债务

- `agentloom_mobile/lib/config/theme.dart:20` 保留 `TODO(theme)`。
- `dark()` 当前只是最基础的 `ThemeData`。

结论：这是明显未打磨项，但相比前述 4 个问题，更像 UI/体验层技术债，暂不列入主 PRD blocker。

## 最终结论

当前仓库在“1.5 阶段应该全部完工”的审查口径下，至少仍有以下 **4 个真实未闭环能力**：

1. Studio Web 认证/会话入口缺失，仍依赖 localStorage 手工 token。
2. API Event 触发器从服务端到前端仍是 preview-only 壳实现。
3. Mobile OAuth / MFA 登录流未完成，MFA 账号被强制回退到 Web。
4. Mobile Settings 已挂到正式导航，但页面仍是 `Coming Soon` stub。

这 4 项里，前 3 项都直接关联 PRD 主能力或安全要求，应优先视为 blocker；第 4 项属于已暴露正式入口的明显未完工页面，也不应继续保留在交付态。
