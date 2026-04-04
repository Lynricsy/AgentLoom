# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

Guidelines for **agentloom-studio** — a React 19 + Vite 7 + TanStack Router frontend using Feature-Slice Architecture with 31 feature modules, Zustand for client state, TanStack Query for server state, and Tailwind CSS 4 + CVA + Radix UI for styling.

**Pre-Development Checklist**: Before coding, read the specific guideline files relevant to your task from the index below.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Feature-Slice architecture, 31 feature modules, barrel imports | Done |
| [Component Guidelines](./component-guidelines.md) | forwardRef+CVA primitives, memo pattern, Radix composition | Done |
| [Hook Guidelines](./hook-guidelines.md) | 4-file API layer, query key factory, ky client | Done |
| [Realtime Execution Views](./realtime-execution-views.md) | Studio + Flutter realtime execution/viewer contracts, ordered segments, workspace preview | Done |
| [Resource Management UI Semantics](./resource-management-ui-semantics.md) | Studio / Flutter 资源页默认筛选、标签和 timeout 展示约定 | Done |
| [Runtime Environment Contracts](./runtime-environment-contracts.md) | Browser-facing env fallback and reverse-proxy auth routing contracts | Done |
| [State Management](./state-management.md) | 3-tier: TanStack Query + Zustand + useState | Done |
| [Quality Guidelines](./quality-guidelines.md) | ESLint 9, Vitest 4, Prettier+Tailwind, strict TS | Done |
| [Type Safety](./type-safety.md) | Strict mode, Zod forms, string unions, null not undefined | Done |

---

## Quick Reference

- **Tech Stack**: React 19, Vite 7, TypeScript 5.9, TanStack Router, TanStack Query 5, Zustand 5, Zod 4, Tailwind CSS 4, Radix UI, ky, Socket.IO, Vitest 4
- **Architecture**: Feature-Slice with barrel imports (`@/features/agent`)
- **State**: TanStack Query (server) + Zustand (client) + useState (local)
- **Styling**: Tailwind + CVA + cn() helper + Radix primitives
- **Path Alias**: `@/` maps to `src/`

---

**Language**: All documentation is written in **English**.
