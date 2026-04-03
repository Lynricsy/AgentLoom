# Backend Development Guidelines

> Best practices for backend development in agentloom-server.

---

## Overview

Guidelines for **agentloom-server** — a NestJS v11 + Fastify v5 backend with Drizzle ORM, BullMQ job queues, Zod validation, multi-tenant PostgreSQL with RLS, and Socket.IO for real-time communication.

**Pre-Development Checklist**: Before coding, read the specific guideline files relevant to your task from the index below.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization, 35 feature modules, flat vs nested | Done |
| [Conventions](./conventions.md) | DI patterns, multi-tenancy, DTOs, response envelope | Done |
| [Database Guidelines](./database-guidelines.md) | Drizzle schema, RLS policies, queries, transactions | Done |
| [API Guidelines](./api-guidelines.md) | Controllers, guards, DTOs, response format, Swagger | Done |
| [Workflow Graph Normalization](./workflow-graph-normalization.md) | 工作流图 canonical 结构、legacy 兼容与 runtime/Studio 一致性 | Done |
| [Error Handling](./error-handling.md) | DomainException hierarchy, filters, RFC 7807 | Done |
| [Execution Realtime Contracts](./realtime-execution-contracts.md) | Agent ordered segments, workflow-agent realtime viewer, persistent sandbox rebinding | Done |
| [Queue Guidelines](./queue-guidelines.md) | BullMQ workers, schedulers, job data typing | Done |
| [Testing Guidelines](./testing-guidelines.md) | Vitest, vi.hoisted, Drizzle mocking, Testcontainers E2E | Done |

---

## Quick Reference

- **Tech Stack**: NestJS v11, Fastify v5, TypeScript, Drizzle ORM, BullMQ, Zod, Vitest, Socket.IO
- **Validation**: Zod + nestjs-zod (NOT class-validator)
- **ORM**: Drizzle (NOT TypeORM)
- **HTTP**: Fastify (NOT Express)
- **Testing**: Vitest (NOT Jest), Testcontainers for E2E
- **Multi-Tenancy**: PostgreSQL RLS via `TenantTransactionInterceptor`
- **Coverage**: 80% threshold
- **Guard Chain**: TenantMiddleware -> TenantTransactionInterceptor -> ThrottlerGuard -> AuthGuard -> TenantGuard -> RolesGuard

---

**Language**: All documentation is written in **English**.
