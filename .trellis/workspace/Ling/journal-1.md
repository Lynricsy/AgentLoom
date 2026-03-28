# Journal - Ling (Part 1)

> AI development session journal
> Started: 2026-03-27

---



## Session 1: 重构 PiConfigGenerator skill 输出为独立文件

**Date**: 2026-03-27
**Task**: 重构 PiConfigGenerator skill 输出为独立文件

### Summary

(Add summary)

### Main Changes

## 目标
将 PiConfigGeneratorService 的 skill 输出从 system prompt 嵌入改为独立 SKILL.md 文件，匹配 pi-mono 的 `loadSkillsFromDir()` 发现机制。

## 核心变更

| 变更 | 说明 |
|------|------|
| `PiConfigBundle.skills` | 新增 `Record<string, Record<string, string>>` 字段，支持多文件 skill |
| `generateSkillFiles()` | 新方法：生成 YAML frontmatter + body 的 SKILL.md，含 kebab-case 名称校验 |
| `generateSystemPrompt()` | 移除 skillContent 拼接 |
| Docker skill 写入 | `docker.service.ts` 创建 `skills/<name>/` 目录并写入文件 |
| Sandbox skill 路径 | `agent-execution.worker.ts` 通过 `SkillInput[]` 传递 skill 到 piConfigInput |
| skillIds 修复 | `agent-definition.service.ts` 修复 `extractConversationSkillIds()` 返回值被丢弃 |

## 修改文件
- `agentloom-server/src/modules/sandbox/pi-config-generator.service.ts`
- `agentloom-server/src/modules/sandbox/docker.service.ts`
- `agentloom-server/src/modules/sandbox/sandbox.service.ts`
- `agentloom-server/src/modules/sandbox/sandbox-lifecycle.producer.ts`
- `agentloom-server/src/modules/sandbox/sandbox-lifecycle.worker.ts`
- `agentloom-server/src/modules/sandbox/sandbox.module.ts`
- `agentloom-server/src/modules/agent-execution/agent-execution.worker.ts`
- `agentloom-server/src/modules/agent-definition/agent-definition.service.ts`
- `agentloom-server/src/modules/agent-definition/agent-runtime-config.interface.ts`
- `agentloom-server/src/modules/sandbox/__tests__/pi-config-generator.service.spec.ts`
- `agentloom-server/src/modules/sandbox/__tests__/docker.service.spec.ts`
- `agentloom-server/src/modules/agent-definition/agent-definition.service.spec.ts`

## 验证
- Unit tests: 153/153 passed (pi-config 35 + docker 30 + agent-def 71 + skill-resolver 17)
- pi-mono 兼容性: 6/6 passed (在 pi-mono 中用 loadSkillsFromDir 验证生成的文件)
- TypeCheck: 通过（零新增错误）


### Git Commits

| Hash | Message |
|------|---------|
| `f16b728` | (see git log) |
| `81c04de` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: feat: Sandbox MCP Client Extension

**Date**: 2026-03-27
**Task**: feat: Sandbox MCP Client Extension

### Summary

在 sandbox 容器内实现原生 MCP 客户端，支持 stdio/SSE/streamable_http，通过 pi-coding-agent Extension API 注册工具，容器内本地执行

### Main Changes



### Git Commits

| Hash | Message |
|------|---------|
| `5715215` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: Canvas 节点功能实现（第一批：部分实现节点）

**Date**: 2026-03-27
**Task**: Canvas 节点功能实现（第一批：部分实现节点）

### Summary

(Add summary)

### Main Changes

## 完成内容

完善 3 个部分实现的 canvas 节点前端功能 + 修正 agent 画布节点过滤。

| 节点 | 改动 |
|------|------|
| `input-preprocessor` | 注册已有 ConfigPanel + 新建 NodeBody（转换类型/表达式/格式） |
| `condition` | 新建 ConfigPanel（表达式/字段比较双模式）+ NodeBody（模式 badge/分支标签） |
| `http-tool` | 重写 ConfigPanel（Headers/Params/Body/Auth/Timeout）+ NodeBody（彩色方法 badge） |
| Agent 画布 | 移除 http-tool/code-tool（工作流专属，非 agent 能力） |

## 其他修复
- 端口名简化：去掉冗余"输入/输出"后缀
- 修复 pre-existing 测试断言（webhook-trigger/api-event-trigger 未同步到测试）

## 关键决策
- http-tool/code-tool 不属于 agent 能力，只在工作流画布中出现
- 后端 handler 不在本次范围（http-tool 的实际调用涉及 SSRF 安全考量）

## 变更文件
- 新建: `InputPreprocessorNodeBody.tsx`, `ConditionNodeBody.tsx`, `HttpToolNodeBody.tsx`, `ConditionConfigPanel.tsx`
- 重写: `HttpToolConfigPanel.tsx`
- 修改: `NodeConfigPanel.tsx`, `CanvasNode.tsx`, `nodeTypeRegistry.ts`, `agent-canvas-registry.ts`
- 测试: `nodeTypeRegistry.test.ts`, `NodePalette.test.tsx`


### Git Commits

| Hash | Message |
|------|---------|
| `4c88b73` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: code-tool 节点完整实现 + exec 端口类型系统

**Date**: 2026-03-27
**Task**: code-tool 节点完整实现 + exec 端口类型系统

### Summary

(Add summary)

### Main Changes

## 实现内容

| 模块 | 改动 |
|------|------|
| **exec 端口类型** | 新增 `exec` PortDataType (arrow shape, slate color)，11 个节点添加 exec 端口 |
| **Code Tool 前端** | CodeToolNodeBody (语言 badge + 代码预览) + CodeToolConfigPanel (Monaco 编辑器) |
| **Code Tool 后端** | CodeExecutionService 子进程执行 JS/TS/Python/Bash，替换原 stub |
| **连接验证** | exec 端口只能连 exec 端口，不参与类型变换 |
| **测试修复** | NodeConfigPanel.test + skill-registration.test 适配新端口类型 |

## 关键文件

**新建 (3)**:
- `agentloom-server/src/modules/agent/code-execution.service.ts`
- `agentloom-studio/src/features/canvas/components/nodes/CodeToolNodeBody.tsx`
- `agentloom-studio/src/features/canvas/components/panels/CodeToolConfigPanel.tsx`

**核心修改 (11)**:
- `typeSchema.ts`, `nodeTypeRegistry.ts`, `index.css` — exec 端口类型
- `connectionCompatibility.ts` — exec 连接隔离
- `CanvasNode.tsx`, `NodeConfigPanel.tsx` — code-tool 组件注册
- `pi-agent-core.adapter.ts`, `agent.module.ts` — 后端执行逻辑
- `agent-runtime-config.interface.ts`, `agent-definition.service.ts` — timeout 字段

## 验证
- TypeCheck 前后端: ✅
- Canvas 测试 634/634: ✅
- Backend 测试 71/71: ✅


### Git Commits

| Hash | Message |
|------|---------|
| `ca2b309` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: 工作流列表页 + Agent 管理增强

**Date**: 2026-03-27
**Task**: 工作流列表页 + Agent 管理增强

### Summary

新增工作流列表页(/workflows)、创建对话框、API hooks；增强 Agent 列表页卡片操作(归档/删除)、改进创建对话框；统一响应式卡片布局和批量操作；新增 DropdownMenu/Checkbox/AlertDialog 共享组件；修复 exec port type 旧错

### Main Changes



### Git Commits

| Hash | Message |
|------|---------|
| `f551f5c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 6: Resource management bug fixes and MCP edit enhancement

**Date**: 2026-03-28
**Task**: Resource management bug fixes and MCP edit enhancement
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## Bug Fixes (from manual testing)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| MCP test 422 | `toSnakeBody` converted `transportType` → `transport_type`, broke Zod discriminatedUnion | Removed `toSnakeBody` from all MCP API calls |
| Skill creation 400 | ky default `Content-Type: application/json` overrode FormData boundary | Removed hardcoded default header |
| Skill creation 500 (FST_FILES_LIMIT) | Fastify global `files: 1` limit | Increased to `files: 50` |
| Skill description truncation | Frontmatter regex only captured first line | Added YAML block scalar + continuation line parsing |
| Skill dropdown clipped | Table `overflow-hidden` clipped absolute dropdown | Replaced with Radix DropdownMenu (Portal) |
| Skill edit toLowerCase error | Backend returns `{ name, size }`, frontend expected `{ fileName, sizeBytes }` | Updated `SkillFileInfo` type |
| stdio MCP timeout | `StdioClientTransport` replaces `process.env` with user env, losing PATH | Merge `process.env` with user env |
| stdio MCP still timeout | npx first-run download exceeds 30s | Increased connect timeout to 120s |

## Enhancements

| Feature | Description |
|---------|-------------|
| MCP edit dialog | Rewrote as 3-tab dialog: Info / Connection / Tools |
| MCP update API | Extended `PATCH configs/:id` to support connection field updates with re-encryption |
| MCP detail API | Added `command`, `args`, `url`, `credentialKeys` to GET response |
| Skill browse page | Replaced table layout with card grid matching MCP page style |

## Key Files Modified
- `agentloom-server/src/modules/mcp/mcp.service.ts` — env merge, timeout, detail/update logic
- `agentloom-server/src/modules/mcp/dto/update-mcp-server-config.dto.ts` — extended with connection union
- `agentloom-studio/src/features/mcp/components/McpServerEditDialog.tsx` — full rewrite
- `agentloom-studio/src/features/skill/components/SkillBrowsePage.tsx` — table → card grid
- `agentloom-studio/src/features/skill/components/CreateSkillDialog.tsx` — multipart + frontmatter fixes
- `agentloom-studio/src/shared/api/client.ts` — removed hardcoded Content-Type


### Git Commits

| Hash | Message |
|------|---------|
| `33007ab` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
