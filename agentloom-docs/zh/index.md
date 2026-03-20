---
layout: home

hero:
  name: AgentLoom
  text: 多智能体工作流编排平台
  tagline: 通过可视化画布将 AI Agent 组合为 DAG 工作流，像编织经纬线一样编排智能协作
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 架构总览
      link: /zh/guide/architecture

features:
  - icon: 🤖
    title: 多智能体编排
    details: 将多个 AI Agent 编排为协作工作流，支持 DAG 调度引擎、状态机驱动执行、断点续跑与人工介入
  - icon: 🎨
    title: 可视化画布
    details: 基于 React Flow 的拖拽式编辑器，16 种节点类型，实时端口类型兼容性检查（Rust WASM 驱动）
  - icon: 🔌
    title: 插件生态系统
    details: 完整的 SDK + CLI + 市场，RSA-PSS 签名验证的 .alp 插件包，Extism WASM 沙箱隔离执行
  - icon: 🔐
    title: 端到端加密
    details: RSA-4096 + AES-256-GCM 混合加密，LLM 输出和决策证据全链路加密，零信任安全架构
  - icon: ⚡
    title: 智能路由
    details: 6 种路由策略 — Token 优化、成本优化、质量优先、延迟优先、历史最优、容错链，支持自动 Fallback
  - icon: 🏢
    title: 企业级治理
    details: 多租户架构、RBAC 五级权限、资源配额管控、审计日志归档、私有化部署支持
  - icon: 🧠
    title: 知识库 RAG
    details: 文档解析 → 分块 → Qdrant 向量化，支持知识增强的 Agent 推理，提升回答质量与准确性
  - icon: 📱
    title: 跨端体验
    details: Web Studio + Flutter 移动端，Socket.IO 实时推送 + FCM 通知，随时随地掌控工作流
---
