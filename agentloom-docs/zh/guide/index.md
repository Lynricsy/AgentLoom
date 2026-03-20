# 什么是 AgentLoom？

AgentLoom 是一个**多智能体工作流编排平台**。它让你能够通过可视化画布将多个 AI Agent 组合为 DAG（有向无环图）工作流，并对其进行调试、执行和监控。

无论你是想构建一个简单的文本处理流水线，还是涉及多模型协作、工具调用、知识检索的复杂智能体系统，AgentLoom 都提供了从定义到运行的完整闭环。

## 核心能力

| 能力 | 说明 |
|------|------|
| 🎨 可视化编排 | 拖拽式画布构建 DAG 工作流，17 种节点类型覆盖 7 大类别 |
| 🤖 多智能体协作 | 支持 Agent 间通过类型化端口传递数据，自动 DAG 调度 |
| 🔌 插件生态 | SDK + CLI + WASM 沙箱，完整的插件开发与分发链路 |
| 🧠 智能路由 | 6 种路由策略，根据成本 / 质量 / 延迟智能选择模型 |
| 🔐 企业级安全 | 端到端加密（E2EE）、多租户隔离、RBAC 权限体系 |
| 📊 运维监控 | 执行追踪、资源治理、审计日志、优化建议 |
| 📱 多端支持 | Web Studio + Flutter 移动端 + Open API |

## 平台组成

AgentLoom 由以下子系统协作构成：

```
┌─────────────────────────────────────────────────┐
│                   客户端层                        │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ AgentLoom    │  │ AgentLoom    │             │
│  │ Studio (Web) │  │ Mobile (App) │             │
│  └──────┬───────┘  └──────┬───────┘             │
│         │ REST / Socket.IO │                     │
├─────────┼──────────────────┼─────────────────────┤
│         ▼                  ▼       服务端层       │
│  ┌─────────────────────────────────┐             │
│  │      AgentLoom Server           │             │
│  │  (NestJS v11 + Fastify v5)     │             │
│  └──────────┬──────────────────────┘             │
│             │                                     │
├─────────────┼─────────────────────────────────────┤
│             ▼           基础设施层                 │
│  PostgreSQL  Redis  Qdrant  MinIO                │
└──────────────────────────────────��──────────────┘
```

- **AgentLoom Studio** — React 19 前端工作台，提供画布编辑器、节点配置、执行监控等核心交互
- **AgentLoom Server** — NestJS v11 后端服务，包含 30 个功能模块，处理工作流执行、智能路由、权限管控等
- **AgentLoom Mobile** — Flutter 移动端应用，支持工作流浏览与执行监控
- **AgentLoom Type Engine** — Rust 编写的 WASM 类型引擎，负责端口数据类型兼容性校验
- **AgentLoom Plugin SDK / CLI** — 插件开发工具链，支持 WASM 沙箱运行

> 详细的系统架构请参阅 [架构总览](/zh/guide/architecture)。

## 文档导航

本文档按照以下结构组织，帮助你快速找到所需内容：

### 入门指南

- [快速开始](/zh/guide/getting-started) — 环境准备、项目启动、开发模式
- [架构总览](/zh/guide/architecture) — 系统架构图、技术栈、多租户设计
- [核心概念](/zh/guide/concepts) — 工作流定义与执行、节点类型、端口数据类型、DAG 调度

### 深入各子系统

- [服务端架构](/zh/server/) — NestJS 模块组织、数据库 Schema、消息队列、Socket.IO 协议
- [工作室前端](/zh/studio/) — React 组件体系、画布引擎、状态管理、Feature-Slice 架构
- [类型引擎](/zh/type-engine/) — Rust WASM 编译、类型兼容性规则、Studio 集成方式

### 生态系统

- [插件开发](/zh/plugins/) — SDK 使用、CLI 脚手架、WASM 沙箱机制
- [移动端](/zh/mobile/) — Flutter 应用架构、Riverpod 状态管理

### 运维与部署

- [API 参考](/zh/api/) — OpenAPI 文档、SDK 生成、认证方式
- [部署运维](/zh/deployment/) — Docker Compose、Helm Charts、私有化部署

## 适合谁阅读？

| 角色 | 推荐路径 |
|------|----------|
| **初次了解** | 本页 → [快速开始](/zh/guide/getting-started) → [核心概念](/zh/guide/concepts) |
| **前端开发者** | [快速开始](/zh/guide/getting-started) → [工作室前端](/zh/studio/) |
| **后端开发者** | [快速开始](/zh/guide/getting-started) → [服务端架构](/zh/server/) |
| **插件开发者** | [核心概念](/zh/guide/concepts) → [插件开发](/zh/plugins/) |
| **运维人员** | [架构总览](/zh/guide/architecture) → [部署运维](/zh/deployment/) |
