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

## 绑定现有 MCP 到编排

如果目标是把**已有** MCP server 绑定到 Agent / Workflow，而不是新建资源：

1. 先 `query_resource_pool(resourceType="mcp_server")` 确认 `mcpServerConfigId`
2. 再 `query_resource_pool(resourceType="mcp_tool")` 找到该 server 下的具体工具定义
3. 新增节点时必须写成：
   - `node.type = "tool"`
   - `node.data.nodeType = "mcp-tool"`
   - `node.data.config.mcpServerConfigId = "<config-id>"`
   - `node.data.config.enabledToolIds = ["<tool-definition-id>", ...]`
   - `node.data.config.tools = [{ id, name, description, mcpServerConfigId, ... }]`
4. 连线必须使用 `tool-out -> tools-in`

注意：

- 不要把字段写成 `mcpServerId`
- 不要只写 server id 而漏掉 `enabledToolIds` / `tools[]`
- 默认应该选择至少一个具体工具；如果要全部启用，就把该 server 的 active tools 全部写入 `enabledToolIds`

## Model

两种方式：

1. 直接使用已有 `providerId`
2. 同时提供新的 `provider` 配置，再创建 model config

## Workspace

空工作区可以直接创建，之后再通过编排把它绑定到 sandbox。

## Agent / Workflow

如果只是为了后续外部编辑或复用，可以先创建空定义，再通过编排编辑工具继续完善。
