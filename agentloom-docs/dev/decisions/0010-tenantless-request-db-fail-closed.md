---
docType: explanation
---

# 0010 无租户请求访问租户数据时 fail-closed

- 状态：已实施
- 日期：2026-10-20

实现见 [数据库 · 租户事务](/dev/server/database#租户事务) 与 [安全 · 数据库行级安全](/dev/server/security#数据库行级安全)。本篇只记录为什么这样设计。

## 背景

线上验收 C5Lifecycle 发现两个缺陷：一个不属于任何组织的用户（刚注册，或被移出组织后刷新过 token，JWT 中没有 `tenant_id`）调用 `GET /api/v1/skills?pageSize=100` 拿到 8 个租户共 39 个 Skill，包括其他组织自建 Skill 的完整 `content`（D-209，P0）；被移除成员用移除前签发的 JWT 读 `/skills`、`/skills/:id`、`/skills/:id/files` 仍返回 200（D-210）。决策时的相关事实：

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | `getTenantDb(db)` 不在租户事务中时返回注入的基础连接；基础连接的数据库角色不受 RLS 约束 | `agentloom-server/src/common/providers/tenant-aware-db.provider.ts`；D-209 中基础连接返回了全部租户的行 |
| F2 | `TenantTransactionInterceptor` 只在 `request.user.tenantId` 存在时开启租户事务，否则直接放行 | `agentloom-server/src/common/interceptors/tenant-transaction.interceptor.ts` |
| F3 | 没有 `@Roles` / `@RequirePermission` 的路由不经过 `TenantGuard`（要求 tenant）与 `RolesGuard`（经 `RbacCacheService` 实时查成员表），租户只取 JWT claim | `agentloom-server/src/common/guards/tenant.guard.ts`、`roles.guard.ts`；路由快照中这类路由标为 `any-authenticated`，修复前共 24 条 |
| F4 | `SkillController.findAll` 没有角色声明也不要求 tenant，`SkillService.findAll` 的查询条件里没有租户，完全依赖 RLS | `agentloom-server/src/modules/skill/skill.controller.ts`、`skill.service.ts` |
| F5 | 合法的「已登录但无租户」调用方只有：`POST /organizations`、`POST /invitations/:token/accept`（已显式使用基础连接，按 token / 新组织租户自行开事务），以及 `/auth/*`、`/devices/*` 这类只读写用户级数据的路由 | `OrganizationService.createOrganization`、`acceptInvitation`；`AuthService`、`DeviceTokenService` |
| F6 | 公开路由（`@Public()`，没有 `request.user`）与非 HTTP 入口（BullMQ worker、定时任务、事件监听器、沙箱回调）从凭据或任务载荷取得租户，自行调用 `runInTenantTransaction` 或在查询中显式带租户条件；同一批工具代码既在 worker 中执行，也经 `POST /agent-runtime/sessions/:sessionId/tool-executions` 回调执行 | `webhook.controller.ts`、`agent-api.service.ts`、`generated-app-public-runtime.service.ts`、`sandbox-agent.adapter.ts` 的 `executeSessionToolCallback` |

## 决策

| 议题 | 选择 | 被否决的方案及原因 |
| --- | --- | --- |
| 已登录、无租户的 HTTP 请求访问 `getTenantDb` | `TenantTransactionInterceptor` 把这类请求的处理器放进无租户作用域（`tenantlessRequestStorage`）；作用域内 `getTenantDb` 直接抛 400 `tenant-required`，不再返回基础连接。作用域内显式 `runInTenantTransaction` 照常取得租户事务。合法调用方（F5）显式使用注入的 `DRIZZLE` 基础连接 | **开启一个不设 `app.current_tenant` 的 `authenticated` 事务，让 RLS 返回空集**：遗漏的路由会静默返回空数据而不是报错，问题更难发现；没有给 `authenticated` 授权的表会变成 500（42501）；每个无租户请求都要多一个事务。**只修 Skill 控制器**：下一个忘记声明角色的路由会重现同样的越权读 |
| 公开路由与非 HTTP 入口 | 不进入无租户作用域，`getTenantDb` 在事务外仍返回基础连接，继续要求这些代码自行 `runInTenantTransaction` 或显式带租户条件 | **事务外一律抛错，系统入口显式标记「系统作用域」**：要逐一改造约 38 个 worker / 定时任务 / 监听器入口与沙箱回调中的工具链，任何遗漏都会在生产中断执行；这些入口的租户来自凭据或任务载荷，不存在「有用户身份却没有租户」这一 D-209 的攻击面 |
| 读取租户数据的路由 | 必须声明 `@Roles` 或 `@RequirePermission`，由 `TenantGuard` 要求 tenant、`RolesGuard` 实时校验成员身份；本次补齐 Skill 读接口、`GET /organizations/current`、`GET /organizations/:id`、`POST /marketplace/listings/:id/reviews`（全部 5 个角色）与 `POST /api-events`（`workflow:run`） | **新增 `skill:read` 权限**：Skill 写接口仍用 `@Roles`，单独为读接口引入权限会让同一模块出现两套声明，且要同步 contracts 与 Studio 门控；与知识库、可复用块等同类模块一致用 `@Roles` |
| Skill 查询 | `SkillService` 的列表、详情、批量查询在应用层显式加「本租户或内置」条件 | 只靠 RLS：Skill 也会在 worker 与沙箱工具回调中查询（F6），这些路径不在租户事务里 |

## 后果

- 忘记声明角色的新路由被无租户用户调用时得到 400，而不是绕过 RLS 读到所有租户的数据。
- 带租户 claim、但没有角色声明的路由仍然只按 JWT claim 取租户，不校验当前成员身份；新增读取租户数据的路由必须声明角色或权限，`route-access.snapshot.spec.ts` 的快照变更在评审中可见。
- 需要在无租户请求里访问数据的服务（创建组织、接受邀请）必须注入 `DRIZZLE` 并显式使用基础连接，并在代码中写明理由。
- 被移出组织的成员用旧 JWT 访问 Skill、组织详情、市场评价与 API 事件时立即得到 403，与 `guide/collaboration/workspace.md` 中「立即失去组织内全部资源的访问权限」一致。

## 确认方式

- 单测：`agentloom-server/src/common/providers/__tests__/tenant-aware-db.provider.spec.ts`、`agentloom-server/src/common/interceptors/__tests__/tenant-transaction.interceptor.spec.ts` 覆盖无租户作用域内 `getTenantDb` 抛错、显式租户事务可用、公开路由与系统上下文不受影响。
- E2E：`agentloom-server/test/skill.e2e-spec.ts`（无组织用户 400、被移除成员 403）、`test/organization.e2e-spec.ts`、`test/api-event.e2e-spec.ts`、`test/marketplace.e2e-spec.ts`。
- 路由快照：`agentloom-server/src/common/guards/__tests__/__snapshots__/route-access.json` 中不再有读取租户数据的 `any-authenticated` 路由。
