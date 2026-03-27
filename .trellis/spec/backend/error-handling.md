# Error Handling

> Exception hierarchy, filters, and logging in agentloom-server.

---

## Overview

All errors extend `DomainException` and are converted to RFC 7807 Problem Details by the global `AllExceptionsFilter`. Each module defines its own exception subclasses. Controllers should never catch exceptions — the filter handles everything.

---

## Exception Hierarchy

### Base Class

```typescript
// src/common/exceptions/domain.exception.ts
export class DomainException extends HttpException {
  readonly type: string;      // URI like "https://agentloom.dev/errors/..."
  readonly detail: string;
  readonly errors?: FieldError[];
  readonly extensions?: Record<string, unknown>;

  constructor(params: {
    type: string;
    title: string;
    status: HttpStatus;
    detail: string;
    errors?: FieldError[];
    extensions?: Record<string, unknown>;
  }) { ... }
}
```

### Module-Specific Exceptions

Each module has a `{name}.exceptions.ts` file:

```typescript
// src/modules/api-key/api-key.exceptions.ts
export class ApiKeyNotFoundException extends DomainException {
  constructor(id: string) {
    super({
      type: 'https://agentloom.dev/errors/api-key-not-found',
      title: 'API 密钥未找到',
      status: HttpStatus.NOT_FOUND,
      detail: `ID 为 ${id} 的 API 密钥不存在`,
    });
  }
}
```

### With Extensions and Field Errors

```typescript
// src/modules/agent-definition/agent-definition.exceptions.ts
export class AgentVersionConflictException extends DomainException {
  constructor(agentId: string, currentVersion: number) {
    super({
      type: 'https://agentloom.dev/errors/agent-version-conflict',
      title: '版本冲突',
      status: HttpStatus.CONFLICT,
      detail: `Agent ${agentId} 已被其他用户修改，请刷新后重试`,
      extensions: { currentVersion },
      errors: [{ field: 'version', message: `当前版本为 ${currentVersion}` }],
    });
  }
}
```

### Auth Exceptions

14 pre-defined auth exceptions in `src/common/exceptions/auth.exceptions.ts`:
- `TenantRequiredException`
- `InsufficientPermissionsException`
- `MfaRequiredException`
- etc.

---

## Global Exception Filter

File: `src/common/filters/all-exceptions.filter.ts`

Converts all exceptions to RFC 7807 `application/problem+json`. Priority:

1. **`ZodValidationException`** -> 422, with `errors[].field` + `errors[].message`
2. **`DomainException`** -> uses exception's `type`, `status`, `detail`, `errors`, `extensions`
3. **`HttpException`** -> generic HTTP error mapping
4. **Unknown exceptions** -> 500 Internal Server Error

The filter uses `FastifyReply` (not Express Response).

### Logging Rules

- 5xx errors: logged with `logger.error()` + stack trace
- 4xx errors: NOT logged at error level
- Audit events: structured JSON via `logger.log()`

---

## Logging Pattern

Every service and guard uses:

```typescript
private readonly logger = new Logger(ClassName.name);
```

Log levels:
- `logger.log()` — informational + audit events
- `logger.warn()` — potential issues
- `logger.error()` — errors with stack trace
- `logger.debug()` — development details

---

## Forbidden Patterns

1. **Raw `HttpException`** — always throw `DomainException` subclasses with a `type` URI
2. **NestJS built-in exceptions** (`NotFoundException`, `BadRequestException`) — create module-specific subclasses
3. **Catching exceptions in controllers** — let the global `AllExceptionsFilter` handle them
4. **Logging 4xx at error level** — only 5xx should be `logger.error()`
5. **Missing `type` URI** — every exception must have a `https://agentloom.dev/errors/` type

---

## Examples

- DomainException base: `src/common/exceptions/domain.exception.ts`
- Auth exceptions: `src/common/exceptions/auth.exceptions.ts`
- Module exceptions: `src/modules/agent-definition/agent-definition.exceptions.ts`
- Global filter: `src/common/filters/all-exceptions.filter.ts`
