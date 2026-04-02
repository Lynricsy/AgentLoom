# Resource Guide

## 先查后建

创建资源前必须先调用 `query_resource_pool`，确认现有资源里没有可复用项。

## create_resource 支持的资源

- `skill`
- `workspace`
- `agent`
- `workflow`
- `mcp`
- `model`

## Skill

推荐参数：

- `name`
- `description`
- `files`

如果是多文件 Skill，`files` 应该包含 `SKILL.md` 以及需要的附属说明文件。

## MCP

推荐参数：

- `serverName`
- `serverDescription`
- `connection`
- `toolNames`
- `conflictStrategy`

## Model

两种方式：

1. 直接使用已有 `providerId`
2. 同时提供新的 `provider` 配置，再创建 model config

## Workspace

空工作区可以直接创建，之后再通过编排把它绑定到 sandbox。

## Agent / Workflow

如果只是为了后续外部编辑或复用，可以先创建空定义，再通过编排编辑工具继续完善。
