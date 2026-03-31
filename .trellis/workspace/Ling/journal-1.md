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


## Session 7: 资源节点任务链收口与 studio 前端全量清绿

**Date**: 2026-03-29
**Task**: 资源节点任务链收口与 studio 前端全量清绿
**Branch**: `main`

### Summary

核查并收口资源节点任务链，补齐 ST5/ST6/ST7 缺口与回归测试，恢复 agentloom-studio 全量测试绿灯，并归档相关 Trellis 任务。

### Main Changes

## 本轮完成

- 重新核查 `03-28-resource-nodes-and-pages`，确认主线任务只拆到 `ST7`，不存在后续未做子任务。
- 补齐 `ST5: 节点验证与联调` 的真实收口工作：修正资源节点测试基线，补回 `llm-model / mcp-tool / knowledge-base / skill / sub-agent` 的关键回归证明。
- 补齐 `ST6: 记忆内容浏览器` 的完成证据：新增 Memory Browser / Sidebar / Version History 等关键测试，覆盖入口、域树、编辑保存、版本回滚等主链路。
- 修复 `ST7: 沙箱预设模板` 的真实缺口：保存预设时真正使用用户输入名称，并增加自定义预设重命名 UI。
- 顺手清理 `agentloom-studio` 全量测试剩余红点，修复 `SecuritySettings` 与 `pluginQueries` 相关测试，使整个前端包恢复全绿。

## 验证结果

- `cd /root/AgentLoom/agentloom-studio && pnpm test --run` 通过：`206` 个测试文件、`1711` 个测试、`0 failures`
- `cd /root/AgentLoom/agentloom-studio && pnpm typecheck` 通过
- `cd /root/AgentLoom/agentloom-studio && pnpm lint` 通过：`0 error`，仍有仓库既有 warnings

## 关键提交

- `a992018` `fix(studio): 🩹 close resource task verification gaps`
- `6df4f5c` `test(studio): ✅ align resource node test baselines`
- `2bfed16` `test(studio): 🧪 restore full frontend test suite`
- `fd1ca57` `chore(studio): 🧹 polish finish-work cleanup`

## 本轮归档的任务

- `03-28-st1-infra-volume-configbar`
- `03-28-st2-memory-mgmt-node`
- `03-28-st3-workspace-mgmt-node`
- `03-28-st4-sandbox-mgmt-node`
- `03-28-st5-compiler-adapt`
- `03-28-st5-node-validation`
- `03-28-st6-memory-browser`
- `03-28-st7-sandbox-presets`
- `03-28-resource-nodes-and-pages`
- `03-28-st4-kb-mcp-node`
- `03-27-resource-management-panels`

## 为什么这样记录

- 这轮最重要的不是“又做了几个测试”，而是把历史上已经实现但仍停在 `planning` 的资源任务链做了证据化核对并真正收口。
- 归档前额外核对了 `KB 路由迁移 + MCP 节点配置` 这条旧子任务的 PRD、代码事实与测试证据，避免仅凭 task 状态或模糊记忆归档。
- 现在 active tasks 列表里已经不再包含本轮资源任务，后续会话不会再被这些旧任务误导。


### Git Commits

| Hash | Message |
|------|---------|
| `a992018` | (see git log) |
| `6df4f5c` | (see git log) |
| `2bfed16` | (see git log) |
| `fd1ca57` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: 编排全流程修复与Memory节点前端收口

**Date**: 2026-03-29
**Task**: 编排全流程修复与Memory节点前端收口
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| 类别 | 内容 |
|------|------|
| 测试报告 | 基于主站部署环境完成 Agent Orchestration 全流程测试，补充 E2E 交接报告，记录资源创建、编译发布、沙箱会话与工具调用链路结果。 |
| Sandbox 修复 | 修复 sandbox 运行时工具结果契约漂移与 PTY 根目录校验问题，恢复 memory / MCP / subagent / PTY / workspace / skill 在主 Agent 对话链路中的可用性。 |
| 前端修复 | 修复 Agent Canvas 中 memory 节点未注册、回退为默认长方形、无法连到主 Agent 的问题；补齐 palette 暴露与 ReactFlow `nodeTypes` 映射。 |
| 历史兼容 | 在 Agent Canvas store 中增加旧快照端口归一化，保证历史 Agent 重新打开时能自动把过期的 `memory-in` 端口从 `knowledge` 修正为 `json`。 |
| 规范同步 | 更新 `.trellis/spec/frontend/component-guidelines.md`，明确 Agent Canvas 新节点必须同步 registry、ReactFlow `nodeTypes`、palette 以及旧快照归一化逻辑。 |

**验证**:
- `cd agentloom-studio && pnpm typecheck`
- `cd agentloom-studio && pnpm test`
- 浏览器复测 `https://agentloom.ling.plus/agents/019d37fb-b735-7364-9060-1a601ef00346`
- 确认 `memory` 节点恢复为正式节点形态，`main-memory -> main-agent-main` 边存在，`Agent Main` 面板显示 `输入端口: 记忆, 类型: JSON`

**补充说明**:
- 已归档任务：`03-29-fix-orchestration-fullflow-handoff-report`
- 本轮最终工作区保持干净，可继续下一轮开发


### Git Commits

| Hash | Message |
|------|---------|
| `6f52976` | (see git log) |
| `4918122` | (see git log) |
| `fc710c0` | (see git log) |
| `419e380` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 9: 知识库 E2E 修复与后端 warning 收口

**Date**: 2026-03-29
**Task**: 知识库 E2E 修复与后端 warning 收口
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| 模块 | 结果 |
|------|------|
| 知识库配置 | 增加 embedding 模型用途与维度配置，支持为知识库绑定可配置维度的 embedding 模型 |
| Agent 调用知识库 | 修复 sandbox agent 中知识库工具未注入的问题，恢复真实 `searchKnowledge_*` tool call |
| 手工 QA | 在线上环境完成知识库管理与 Agent 调用知识库链路验证，确认返回校验码 `KB-ALPHA-20260329-FOX` |
| 后端收口 | 修复测试/类型漂移并清零 ESLint warning，恢复后端 lint / typecheck / test 基线 |

**验证**
- `agentloom-server`：`eslint --max-warnings=0`、`tsc --noEmit`、`test` 全通过（278 files / 3407 tests）
- `agentloom-studio`：构建与相关测试已在前序收口中通过
- 线上 `https://agentloom.ling.plus/` 已完成手工浏览器 E2E 验证

**相关提交**
- `fbc4e54` `feat(knowledge): 🦊 add embedding config support and restore kb tools`
- `27c05f4` `fix(server): 🦊 restore backend finish-work baseline`
- `99f27eb` `fix(server): 🦊 eliminate backend lint warnings`


### Git Commits

| Hash | Message |
|------|---------|
| `fbc4e54` | (see git log) |
| `27c05f4` | (see git log) |
| `99f27eb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 10: 知识库迁移收尾与浏览器对话链路验收

**Date**: 2026-03-30
**Task**: 知识库迁移收尾与浏览器对话链路验收
**Branch**: `main`

### Summary

完成知识库链路迁移收尾，修复对话实时事件卡住问题并补平 finish-work 清理项；真实浏览器 QA 通过，localhost 刷新白屏被定位为本地环境配置问题。

### Main Changes

| 项目 | 说明 |
|------|------|
| 知识库链路 | 完成 knowledge pipeline 向 knowledge nodes / LlamaIndex.TS 的迁移收尾，前后端、检索、Agent 对话链路已经联通。 |
| 实时事件修复 | 修复 `agent-conversation` 在 worker 与 gateway 跨进程广播时的实时事件同步问题，避免前端 tool call 停留在“处理中”且最终消息无法闭环。 |
| 质量补平 | 为通过 `finish-work` 清理 Studio 新增的非空断言，并补做二次验证，保证新增代码静态清洁。 |
| 浏览器验收 | 在正式同源入口验证 `search_knowledge` 被真实调用，最终答案正确命中 `KB-ALPHA-20260329-FOX`，刷新后历史消息与 tool calls 可以恢复。 |
| 环境结论 | `http://localhost:8080` 的硬刷新白屏被定位为本地 `.env` 中前端入口与 `VITE_SUPABASE_URL` 指向不同域名导致的认证 CORS 问题，不属于本次代码回归。 |

**为什么这样记录**：
- 本轮代码已经提交并推送到 `main`，自动化验证和人工验收均已完成，任务应当归档而不是继续保留在活动列表。
- 将“真实回归修复”与“本地环境配置问题”明确分离，便于后续会话快速判断风险边界，避免重复排查错误方向。

**验证结论**：
- `agentloom-server`：`pnpm lint`、`pnpm exec tsc --noEmit -p tsconfig.json`、`pnpm test`（3382/3382 通过）
- `agentloom-studio`：`pnpm test`（1707/1707 通过）、`pnpm build`
- 定向测试：`agent-conversation.store.test.ts`、`KnowledgeBaseDetailPage.test.tsx`
- 浏览器：同源入口 `https://agentloom.ling.plus` 的完整知识库问答链路通过


### Git Commits

| Hash | Message |
|------|---------|
| `ef1752a` | (see git log) |
| `ad225bc` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 11: 工作流编排手工 QA 收口与质量记录

**Date**: 2026-03-30
**Task**: 工作流编排手工 QA 收口与质量记录
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

| 模块 | 记录 |
|------|------|
| Workflow QA | 基于 `https://agentloom.ling.plus/` 完成工作流编排 browser manual QA，覆盖流程控制、sandbox/memory 一连多语义、多 agent workflow、workflow 管理链路以及能力扩展节点与 trigger 外部触发链路。 |
| 缺陷修复 | 修复了 workflow execution detail/debug view 阻断、persistent sandbox 多节点绑定生命周期、`/v1/prompt` 超时、trigger UI 对 `webhook/api_event` 的 camelCase 请求体序列化错误。 |
| 能力节点 | 验证 `code-tool`、`http-tool`、`skill`、`mcp-tool`、`knowledge-base` 对 agent 的“扩展”语义，以及 sandbox 对 agent 的“覆盖”语义；完成 webhook、api_event、cron 三类 trigger 真实触发回归。 |
| 质量收尾 | 在 `$finish-work` 阶段定位并修复 `WorkflowStatusBar.test.tsx` fake timers 泄漏导致的 studio 全量测试超时；同步修复 `triggerApi.test.ts` lint 阻断。 |
| 验证结果 | `agentloom-studio`：`pnpm lint` / `pnpm typecheck` / `pnpm test` 全通过（215/215 文件，1720/1720 用例）；`agentloom-server`：`pnpm lint` / `pnpm test` 全通过（278/278 文件，3422/3422 用例）。 |

**关键执行与结果**
- 共享持久 sandbox 多 agent 成功 execution：`019d3c04-571f-7efe-bd21-7431fcab42cf`
- 双 session 持久 sandbox 成功 execution：`019d3c22-cc4b-78ee-a46f-e8ab3399f91d`
- 能力扩展 workflow：`019d3c7e-d3f2-7414-a847-878010f8ed3a`
- webhook 触发 execution：`019d3c97-4ac8-7eee-922a-4481b5b28445`
- api_event 触发 execution：`019d3c97-a101-7c66-8fb1-d62778b86338`
- cron 触发 execution：`019d3c99-1ae3-728b-a92e-989346478dbe`
- http-tool manual execution：`019d3c9e-de1d-707f-b0f4-b4e3bd380392`

**提交链路**
- `b99194d` `fix(workflow): 🐛 修复编排 QA 阻断并收口共享沙箱链路`
- `eab001d` `fix(workflow): 🐛 修复能力节点扩展与 trigger 外部触发链路`
- `c7fff1e` `test(studio): 🧪 修复 finish-work 校验阻断`
- `79b1980` `style(server): 🎨 对齐 sandbox 与 workflow-agent 链路格式`

**收尾状态**
- 任务 `03-30-workflow-orchestration-manual-qa` 已归档。
- 当前分支 `main` 已推送至远端。
- 工作区保持干净，可继续进入下一轮任务。


### Git Commits

| Hash | Message |
|------|---------|
| `b99194d` | (see git log) |
| `eab001d` | (see git log) |
| `c7fff1e` | (see git log) |
| `79b1980` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 12: 修复 studio 多页面滚动失效

**Date**: 2026-03-30
**Task**: 修复 studio 多页面滚动失效
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## 问题
studio 前端大量页面无法滚轮滚动、没有滚动条。

## 根因
`__root.tsx` 根布局中双层 `overflow-hidden`，导致未自行管理滚动的页面内容被裁剪。

## 修复
| 文件 | 改动 |
|------|------|
| `__root.tsx:100` | `overflow-hidden` → `overflow-y-auto` |
| `AgentConversationPage.tsx:301` | `h-screen` → `h-full` |

**受影响页面**: MarketplaceBrowsePage, TemplateBrowsePage, MemoryInstancesPage, SkillBrowsePage, McpServerManagementPage, AgentConversationPage


### Git Commits

| Hash | Message |
|------|---------|
| `46f66c7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 13: feat: Workflow/Agent 自定义 Emoji/Icon 选择器

**Date**: 2026-03-30
**Task**: feat: Workflow/Agent 自定义 Emoji/Icon 选择器
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## 概述

为 Workflow 和 Agent 实体添加自定义 Emoji/Icon 支持，使用 Fluent Emoji 3D CDN 图片渲染，替代原有固定图标。

## 技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| Emoji 渲染 | CDN Fluent Emoji 3D | 视觉效果最佳，跨平台一致 |
| 数据层 | @emoji-mart/data | 全量 emoji 元数据，仅增加一个依赖 |
| 选择器 | 自建 Picker | @lobehub/ui 依赖 antd 不兼容，emoji-mart v5 不支持自定义渲染 |
| 存储格式 | emoji: codepoint / lucide: "lucide:Name" / null: 默认 | 简洁通用 |

## 改动范围

### 后端 (agentloom-server)
- Schema: `workflow_definitions` + `agent_definitions` 新增 `icon varchar(255)` nullable 列
- DTOs: create/update/response 全部接入 icon 字段
- Services: LIST_COLUMNS、create insert、update setClause 均接入
- Migration: `0058_add-icon-to-workflow-and-agent.sql`

### 前端新组件 (agentloom-studio)
- `EntityIcon` — 通用渲染组件（Fluent CDN / lucide / fallback）
- `EmojiIconPicker` — Radix Popover 选择器，Emoji + Lucide 双 Tab，虚拟滚动

### 前端集成
- `WorkflowListPage` / `AgentListPage` — 列表图标动态化
- `CreateWorkflowDialog` / `CreateOrchestrationDialog` — 创建时选 icon
- `AgentSettingsPanel` — 编辑时修改 icon

## 验证
- 前后端 TypeScript + ESLint 通过
- 215 test files / 1720 tests 全部通过
- Docker 镜像重建部署 + DB migration 完成


### Git Commits

| Hash | Message |
|------|---------|
| `e0beed4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 14: 统一端口 ID 命名规范与优化端口标签

**Date**: 2026-03-30
**Task**: 统一端口 ID 命名规范与优化端口标签
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## 变更概要

全面审计并优化 AgentLoom 两套画布注册表（22 个工作流节点 + 11 个 Agent 配置节点）的端口定义，统一命名规范。

## 关键变更

| 维度 | 内容 |
|------|------|
| 端口 ID 规范 | 全部统一为 `{name}-in` / `{name}-out`，`_` 分隔符改为 `-` |
| 无效端口清理 | 删除 3 个无意义输入端口（llm-model/knowledge-base/mcp-tool 源节点） |
| 标签优化 | "模型输出"→"模型"、"Sandbox 环境"→"沙箱" 等简洁中文名词 |
| 后端兼容 | 执行引擎输入读取保留旧 ID 回退，结果构造仅写新 ID |

## 影响范围

- **34 个文件**（+237/-309 行）
- 前端：nodeTypeRegistry.ts、agent-canvas-registry.ts、canvasStore.ts、mcpToolMapping.ts + 22 测试文件
- 后端：node-scheduler.service.ts、execution.service.ts、agent-prompt-content.builder.ts、workflow-agent-adapter.ts、mcp.service.ts、migrate-agents.ts + 8 测试文件

## 测试结果

- Studio：214 文件 / 1710 测试全部通过
- Server：277/278 文件通过（1 个预存 workflow-version 失败，与本次无关）
- Typecheck：Server + Studio 均通过


### Git Commits

| Hash | Message |
|------|---------|
| `fc728b2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 15: Agent 对话页面 MCP 解析 / Markdown 渲染 / 布局修复

**Date**: 2026-03-30
**Task**: Agent 对话页面 MCP 解析 / Markdown 渲染 / 布局修复
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## 本次会话完成内容

| 变更 | 描述 |
|------|------|
| MCP 结果解析 | store 层 `unwrapMcpResult()` 统一解包 MCP 标准信封 `{content:[{type,text}]}`，覆盖实时事件和历史记录两条路径 |
| Markdown 渲染增强 | 安装 `@tailwindcss/typography`（之前 prose 类完全无效），重写 MarkdownRenderer：代码块语言标签+复制按钮，`prose-agent` CSS 主题定制 |
| 滚动修复 | flex 子项缺少 `min-h-0` 导致 MessageList 无法滚动，MessageList 根元素改 `h-full` |
| 宽度溢出修复 | 左侧消息面板添加 `shrink-0` 防止被右侧电脑面板挤压 |
| ThinkingBlock 增强 | 卡片式样式、中文"思考过程"标签、折叠时显示内容预览 |

## 关键变更文件

- `agentloom-studio/src/features/agent-conversation/stores/agent-conversation.store.ts` — unwrapMcpResult
- `agentloom-studio/src/shared/components/markdown/MarkdownRenderer.tsx` — 重写
- `agentloom-studio/src/index.css` — typography 插件 + prose-agent CSS
- `agentloom-studio/src/features/agent-conversation/components/MessageList.tsx` — 滚动+ThinkingBlock
- `agentloom-studio/src/features/agent-conversation/components/AgentConversationPage.tsx` — 布局修复

## 技术决策

- **MCP 结果在 store 层统一解包**而非在每个 renderer 里单独处理，因为 MCP SDK 的输出信封格式是协议标准，所有工具一致
- **选择 @tailwindcss/typography** 而非手写 prose CSS，因为项目已用 Tailwind v4，typography 插件提供完整的排版基线
- **`prose-agent` CSS 自定义类**通过 CSS 变量覆盖 typography 默认值，匹配项目暗色/亮色主题


### Git Commits

| Hash | Message |
|------|---------|
| `164b21e` | (see git log) |
| `1ed4718` | (see git log) |
| `8dc70d0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 16: Agent 对话沙箱启动阶段状态展示

**Date**: 2026-03-31
**Task**: Agent 对话沙箱启动阶段状态展示
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## 概要

为 Agent 对话添加沙箱启动分阶段状态展示，替代原有的通用 "Processing" 转圈。

## 变更

| 层 | 文件 | 变更 |
|---|---|---|
| Server | `execution-event.types.ts` | 新增 `PreparationPhase` 类型，扩展 `ExecutionStatusChangedPayload` |
| Server | `agent-execution.worker.ts` | 5 个阶段事件发射点 + 沙箱复用检测 + 失败阶段标记 |
| Studio | `types.ts` + `agent-conversation.store.ts` | 类型定义 + 5 个 state 字段 + 事件处理 |
| Studio | `PreparationCard.tsx` + `MessageList.tsx` | Stepper 卡片（Lucide icons + 收缩动画）+ 集成 |
| Flutter | `conversation_message_dto.dart` + `provider` | enum + state 扩展 + 事件处理 |
| Flutter | `preparation_card.dart` + `screen` | Stepper widget（Material Icons + AnimatedSize）+ 集成 |

## 技术要点

- 5 个阶段：`queued → preparing → sandbox_creating → agent_initializing → running`
- 沙箱复用时跳过 `sandbox_creating`，并携带 `sandboxReused: true`
- 失败时携带 `failedPhase` + `error`，前端对应阶段标红
- 卡片出现在 Agent 消息位置，Agent 回复后平滑收缩为一行摘要
- 向后兼容：所有新字段 optional，旧客户端安全忽略
- Check Agent 修复了 3 个状态清理 bug（done/completed/cancelled 终态遗漏）


### Git Commits

| Hash | Message |
|------|---------|
| `4231a93` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 17: Flutter workflow/agent 卡片式布局重构

**Date**: 2026-03-31
**Task**: Flutter workflow/agent 卡片式布局重构
**Branch**: `main`

### Summary

(Add summary)

### Main Changes

## 变更概述

将 Flutter 客户端 workflow 和 agent 列表页从单列 ListView 重构为响应式多列网格卡片布局，统一设计语言，补充图标显示。

## 新建文件

| 文件 | 说明 |
|------|------|
| `shared/widgets/entity_icon.dart` | 三格式图标组件（null→fallback / lucide→Material / emoji→Fluent 3D CDN），对齐 Studio EntityIcon.tsx |
| `shared/widgets/entity_grid_card.dart` | 统一网格卡片组件，图标+名称+状态+描述+日期版本 |

## 修改文件

| 文件 | 变更 |
|------|------|
| `pubspec.yaml` | 添加 `cached_network_image` 依赖 |
| `workflow_definition_dto.dart` + freezed | 补充 `String? icon` 字段 |
| `workflows_screen.dart` | ListView → 响应式 SliverGrid (2/3/4列) + AppBar 图标 |
| `agent_list_screen.dart` | ListView → 响应式 SliverGrid + AppBar 图标 |
| `workflow_detail_screen.dart` | 顶部添加 EntityIcon |
| `agent_detail_screen.dart` | 硬编码 smart_toy → EntityIcon |
| `dashboard_screen.dart` | AppBar 加图标 |
| `resources_hub_screen.dart` | AppBar 加图标 |
| `settings_screen.dart` | AppBar 加图标 |

## 关键设计决策

- **EntityIcon 三格式对齐 Studio**: null→fallback, lucide:xxx→Material 映射(25个), emoji codepoint→CDN 图片+双层 fallback
- **响应式断点**: <600px=2列, 600-900px=3列, >=900px=4列
- **统一卡片**: EntityGridCard 取代独立的 WorkflowCard/AgentCard 在列表页的使用


### Git Commits

| Hash | Message |
|------|---------|
| `51d84c6` | (see git log) |
| `c1d81d5` | (see git log) |
| `0f9090d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
