---
docType: howto
---

# 新增服务端模块

要在 server 里加一个新的业务域（自己的 REST 端点、数据表、错误类型），按本页步骤从目录到文档一次做完。下文以模块名 `widget`、表名 `widgets` 为例，替换成你的名字即可；参照对象是结构最简单的现有模块 `agentloom-server/src/modules/reusable-block/`。

前置条件：本地开发环境可用（[搭建本地开发环境](/dev/setup)），`agentloom-server/` 下 `.env` 中的 `APP_DATABASE_URL` 指向可写的开发库，Redis 可达（`pnpm contracts:regen` 的 OpenAPI 导出步骤需要连接 Redis）。

## 1. 建目录与文件

```text
agentloom-server/src/modules/widget/
├── __tests__/widget.service.spec.ts
├── dto/widget.dto.ts
├── widget.controller.ts
├── widget.exceptions.ts
├── widget.module.ts
└── widget.service.ts
```

文件名 kebab-case，后缀固定为 `.controller.ts`、`.service.ts`、`.module.ts`、`.dto.ts`、`.exceptions.ts`；有队列时加 `.worker.ts`，有 Socket 网关时加 `.gateway.ts`。

## 2. 用 Zod 定义 DTO

请求体先写命名的 Zod schema，再派生 DTO 类；全局 `ZodValidationPipe` 会据此校验，失败返回 422。参照 `agentloom-server/src/modules/reusable-block/dto/reusable-block.dto.ts`：

```ts
// agentloom-server/src/modules/widget/dto/widget.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateWidgetSchema = z.object({
  name: z.string().min(1).max(255),
});

export class CreateWidgetDto extends createZodDto(CreateWidgetSchema) {}
```

响应 schema 单独定义（不要复用带 `.default()` 的请求 schema），手写类型用 `z.infer` 导出。

## 3. 定义领域异常

错误一律继承 `agentloom-server/src/common/exceptions/domain.exception.ts` 的 `DomainException`，由 `AllExceptionsFilter` 输出 problem+json。`type` 用 `agentloom-server/src/common/exceptions/problem-type.ts` 的 `problemType('<kebab-case slug>')` 生成，它补上唯一前缀 `https://agentloom.dev/errors/`：

```ts
// agentloom-server/src/modules/widget/widget.exceptions.ts
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';
import { problemType } from '../../common/exceptions/problem-type';

export class WidgetNotFoundException extends DomainException {
  constructor(widgetId: string) {
    super({
      type: problemType('widget-not-found'),
      title: 'Widget 不存在',
      status: HttpStatus.NOT_FOUND,
      detail: `Widget ${widgetId} 不存在`,
    });
  }
}
```

`agentloom-server/src/common/exceptions/problem-type.spec.ts` 用 AST 扫描所有 `DomainException` 的 `type`，只接受 `problemType()` 调用或以该前缀开头的字面量，其他写法会让单测失败。

## 4. 定义数据表并挂 RLS

在 `agentloom-server/src/database/schema/` 下新建 `widgets.schema.ts`。租户数据表必须有 `tenant_id` 列，并展开 `agentloom-server/src/database/schema/rls-policies.ts` 的 `createDirectTenantPolicies`，它生成 SELECT/INSERT/UPDATE/DELETE 四条 `tenant_id = get_tenant_id()` 策略。参照 `agentloom-server/src/database/schema/reusable-blocks.schema.ts`：

```ts
// agentloom-server/src/database/schema/widgets.schema.ts
import { sql } from 'drizzle-orm';
import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { createDirectTenantPolicies } from './rls-policies';

export const widgets = pgTable(
  'widgets',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [...createDirectTenantPolicies('widgets')],
);
```

然后在 `agentloom-server/src/database/schema/index.ts` 中导出 `widgets`。drizzle-kit 只读这个入口（`agentloom-server/drizzle.config.ts` 的 `schema`），漏导出则迁移里不会出现新表。

## 5. 生成迁移

```bash
cd agentloom-server
pnpm db:generate
```

`agentloom-server/src/database/migrations/` 下出现一个新的 `NNNN_<随机名>.sql`，`meta/_journal.json` 与新快照同步更新。打开 SQL 确认包含 `CREATE TABLE "widgets"`、`ENABLE ROW LEVEL SECURITY` 与四条 `CREATE POLICY`。随后 `pnpm db:migrate` 应用到开发库。

## 6. 写 service 与 controller

- service 构造器注入 `@Inject(DRIZZLE) db: DrizzleDB`，查询时用租户事务内的连接（参照 `agentloom-server/src/modules/reusable-block/reusable-block.service.ts` 的 `tenantDb` getter，它取自 `agentloom-server/src/common/providers/tenant-aware-db.provider.ts`），RLS 才会生效。
- controller 用 `@Controller('widgets')` 声明前缀（全局前缀 `api/v1` 自动加上），每个处理器用 `agentloom-server/src/common/decorators/roles.decorator.ts` 的 `@Roles(...)` 声明可访问角色。

## 7. 注册模块

在 `widget.module.ts` 声明 controllers/providers，然后把 `WidgetModule` 加到 `agentloom-server/src/app.module.ts` 的 `imports`。

```bash
pnpm typecheck
```

退出码为 0。`pnpm start:dev` 后访问 `http://localhost:3000/docs`，Swagger 中出现 `widgets` 路径。

## 8. 写单测

在 `__tests__/widget.service.spec.ts` 中覆盖 service 的行为与异常分支（mock 模式见 [运行与编写测试](/dev/testing)），涉及租户隔离时在 `agentloom-server/test/` 加 E2E：

```bash
pnpm test src/modules/widget
```

输出中 `Test Files` 一行全部 `passed`。

## 9. 再生成契约与文档

在仓库根执行：

```bash
pnpm contracts:regen
pnpm docs:gen
```

- `pnpm contracts:regen` 之后，`agentloom-server/sdk/openapi.json` 与 `agentloom-api-client/src/models.ts` 出现新端点与模型（这两个文件只能这样生成，不要手改）。
- `pnpm docs:gen` 之后，`agentloom-docs/_generated/server-modules.md` 出现 `widget` 一行，`agentloom-docs/_generated/tables.md` 出现 `widgets` 表。

最后在 [模块与分域](/dev/server/) 页的分域说明里给新模块补一句职责，运行 `pnpm docs:check` 确认退出码为 0，把 `_generated/` 的变更一起提交。用户可见的功能还需要补 [用户指南](/guide/) 中的页面，规则见 [文档维护指南](/dev/docs-maintenance)。
